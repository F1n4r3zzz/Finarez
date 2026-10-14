import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';
import { loadLocalEnv } from './env';
import { clientAddressFromSocket } from './http/client-address';
import { createAuth } from './modules/identity';
import { BudgetedEmailSender, EmailBudget } from './platform/email/budget';
import { ConsoleEmailSender } from './platform/email/email';

loadLocalEnv();
const config = loadConfig();
const { db, pool } = createDatabase(config.DATABASE_URL);
const emailBudget = new EmailBudget(db, config.EMAIL_DAILY_LIMIT);
const email = new BudgetedEmailSender(new ConsoleEmailSender(), emailBudget);
const auth = createAuth({ db, config, email, emailBudget });
const app = createApp({ db, auth, appUrl: config.APP_URL });

// Direct Node listener: the client address comes from the socket, never from request headers.
// (On Vercel, the platform sets x-forwarded-for itself.)
const server = serve({
  fetch: (req, env) =>
    app.fetch(clientAddressFromSocket(req, env.incoming.socket.remoteAddress), env),
  port: config.PORT,
});
console.log(`API listening on http://localhost:${config.PORT}/api`);

const shutdown = () => server.close(() => void pool.end());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
