import { z } from 'zod';

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    /** Public origin of the web app; auth links and cookies are issued for it. */
    APP_URL: z.url({ protocol: /^https?$/ }),
    /** Signs sessions and tokens. At least 32 random characters; never commit a real one. */
    AUTH_SECRET: z.string().min(32),
    /** `console` prints emails (local only); `resend` sends them through Resend. */
    EMAIL_TRANSPORT: z.enum(['console', 'resend']).default('console'),
    RESEND_API_KEY: z.string().min(1).optional(),
    /** Sender. Without a verified domain, Resend only delivers to the account owner. */
    EMAIL_FROM: z.string().min(3).default('Finanz <onboarding@resend.dev>'),
    /** Hard cap on emails sent per UTC day across all instances (provider free tier). */
    EMAIL_DAILY_LIMIT: z.coerce.number().int().min(0).default(90),
    /**
     * Sign-in attempts per address every 15 minutes. Raised only for end-to-end runs, where
     * every test user signs in from the same machine.
     */
    AUTH_SIGN_IN_LIMIT: z.coerce.number().int().min(1).default(5),
    /** Sign-ups per address every hour; raised only for end-to-end runs, like the above. */
    AUTH_SIGN_UP_LIMIT: z.coerce.number().int().min(1).default(5),
  })
  .refine((c) => !(c.NODE_ENV === 'production' && c.EMAIL_TRANSPORT === 'console'), {
    path: ['EMAIL_TRANSPORT'],
    message: 'The console transport prints email links and is not allowed in production',
  })
  .refine((c) => !(c.NODE_ENV === 'production' && c.AUTH_SIGN_IN_LIMIT > 5), {
    path: ['AUTH_SIGN_IN_LIMIT'],
    message: 'Production keeps the sign-in limit at 5 or fewer attempts',
  })
  .refine((c) => !(c.NODE_ENV === 'production' && c.AUTH_SIGN_UP_LIMIT > 5), {
    path: ['AUTH_SIGN_UP_LIMIT'],
    message: 'Production keeps the sign-up limit at 5 or fewer an hour',
  })
  .refine((c) => c.EMAIL_TRANSPORT !== 'resend' || c.RESEND_API_KEY !== undefined, {
    path: ['RESEND_API_KEY'],
    message: 'Required when EMAIL_TRANSPORT is resend',
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
