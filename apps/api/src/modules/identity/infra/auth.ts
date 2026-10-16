import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@finanz/contracts';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { Config } from '../../../config';
import type { Database } from '../../../db/client';
import { type EmailBudget, reserveEmail } from '../../../platform/email/budget';
import type { EmailMessage, EmailSender } from '../../../platform/email/email';
import { EmailDeliveryError } from '../../../platform/email/resend';
import { resetPasswordEmail, verificationEmail } from './emails';
import { accounts, rateLimits, sessions, users, verifications } from './schema';

export interface AuthDeps {
  db: Database;
  config: Pick<Config, 'APP_URL' | 'AUTH_SECRET'> &
    Partial<Pick<Config, 'AUTH_SIGN_IN_LIMIT' | 'AUTH_SIGN_UP_LIMIT'>>;
  /** Must draw from `emailBudget` (e.g. a BudgetedEmailSender). */
  email: EmailSender;
  emailBudget: EmailBudget;
}

/** Endpoints that may send an email; each reserves budget before touching the account. */
const EMAIL_SENDING_PATHS = new Set([
  '/sign-up/email',
  '/send-verification-email',
  '/request-password-reset',
]);

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function createAuth({ db, config, email, emailBudget }: AuthDeps) {
  // Delivery failures keep the normal answer (no account discovery); the user can ask for
  // the email again. Logged without the address.
  const deliver = async (kind: string, message: EmailMessage) => {
    try {
      await email.send(message);
    } catch (error) {
      // The provider's status helps; other errors are named only (messages may hold data).
      const reason =
        error instanceof EmailDeliveryError
          ? error.message
          : error instanceof Error
            ? error.name
            : 'unknown';
      console.error(`Email delivery failed (${kind}):`, reason);
    }
  };

  return betterAuth({
    appName: 'Finarez',
    baseURL: config.APP_URL,
    basePath: '/api/auth',
    secret: config.AUTH_SECRET,
    trustedOrigins: [config.APP_URL],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        rateLimit: rateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: HOUR,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await deliver('password reset', resetPasswordEmail(user.email, url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Never: opening a verification link must not sign anyone in, or an attacker could send
      // their own link and have the victim work inside the attacker's account (Codex CP3 #1).
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, url }) => {
        await deliver('verification', verificationEmail(user.email, url));
      },
    },
    session: {
      expiresIn: 14 * DAY,
      updateAge: DAY,
    },
    // Stored in Postgres so limits hold across serverless instances (Codex CP1 #6).
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: MINUTE,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 15 * MINUTE, max: config.AUTH_SIGN_IN_LIMIT ?? 5 },
        '/sign-up/email': { window: HOUR, max: config.AUTH_SIGN_UP_LIMIT ?? 5 },
        '/request-password-reset': { window: HOUR, max: 3 },
        '/reset-password': { window: HOUR, max: 5 },
        '/send-verification-email': { window: HOUR, max: 3 },
      },
    },
    hooks: {
      // Runs after the rate limit and before the endpoint looks at the account.
      before: createAuthMiddleware(async (ctx) => {
        if (EMAIL_SENDING_PATHS.has(ctx.path) && !(await reserveEmail(emailBudget))) {
          throw new APIError('SERVICE_UNAVAILABLE', {
            code: 'EMAIL_UNAVAILABLE',
            message: 'Email is temporarily unavailable. Try again later.',
          });
        }
      }),
    },
    advanced: {
      useSecureCookies: config.APP_URL.startsWith('https://'),
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
