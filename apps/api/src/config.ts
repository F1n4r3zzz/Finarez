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
    EMAIL_TRANSPORT: z.enum(['console']).default('console'),
    /** Hard cap on emails sent per UTC day across all instances (provider free tier). */
    EMAIL_DAILY_LIMIT: z.coerce.number().int().min(0).default(90),
  })
  .refine((c) => !(c.NODE_ENV === 'production' && c.EMAIL_TRANSPORT === 'console'), {
    path: ['EMAIL_TRANSPORT'],
    message: 'The console transport prints email links and is not allowed in production',
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
