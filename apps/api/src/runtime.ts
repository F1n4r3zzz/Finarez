import { createApp } from './app';
import type { Config } from './config';
import { createDatabase } from './db/client';
import { createAuth } from './modules/identity';
import { BudgetedEmailSender, EmailBudget } from './platform/email/budget';
import { ConsoleEmailSender, type EmailSender } from './platform/email/email';
import { ResendEmailSender } from './platform/email/resend';

function emailTransport(config: Config): EmailSender {
  if (config.EMAIL_TRANSPORT === 'resend' && config.RESEND_API_KEY) {
    return new ResendEmailSender(config.RESEND_API_KEY, config.EMAIL_FROM);
  }
  return new ConsoleEmailSender();
}

/** The API wired to its database and email provider; shared by the Node server and Vercel. */
export function createRuntime(config: Config) {
  const { db, pool } = createDatabase(config.DATABASE_URL);
  const emailBudget = new EmailBudget(db, config.EMAIL_DAILY_LIMIT);
  const email = new BudgetedEmailSender(emailTransport(config), emailBudget);
  const auth = createAuth({ db, config, email, emailBudget });
  const app = createApp({ db, auth, appUrl: config.APP_URL });
  return { app, pool };
}
