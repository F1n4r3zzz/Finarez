import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Config } from '../../../config';
import type { Database } from '../../../db/client';
import type { EmailSender } from '../../../platform/email/email';
import { resetPasswordEmail, verificationEmail } from './emails';
import { accounts, rateLimits, sessions, users, verifications } from './schema';

export interface AuthDeps {
  db: Database;
  config: Pick<Config, 'APP_URL' | 'AUTH_SECRET'>;
  email: EmailSender;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function createAuth({ db, config, email }: AuthDeps) {
  return betterAuth({
    appName: 'Finanz',
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
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: HOUR,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await email.send(resetPasswordEmail(user.email, url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, url }) => {
        await email.send(verificationEmail(user.email, url));
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
        '/sign-in/email': { window: 15 * MINUTE, max: 5 },
        '/sign-up/email': { window: HOUR, max: 5 },
        '/request-password-reset': { window: HOUR, max: 3 },
        '/reset-password': { window: HOUR, max: 5 },
        '/send-verification-email': { window: HOUR, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: config.APP_URL.startsWith('https://'),
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
