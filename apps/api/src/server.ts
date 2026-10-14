import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';
import { loadLocalEnv } from './env';
import { createAuth } from './modules/identity';
import { BudgetedEmailSender } from './platform/email/budget';
import { ConsoleEmailSender } from './platform/email/email';

loadLocalEnv();
const config = loadConfig();
const { db, pool } = createDatabase(config.DATABASE_URL);
const email = new BudgetedEmailSender(new ConsoleEmailSender(), db, config.EMAIL_DAILY_LIMIT);
const auth = createAuth({ db, config, email });

const server = serve({ fetch: createApp({ db, auth }).fetch, port: config.PORT });
console.log(`API listening on http://localhost:${config.PORT}/api`);

const shutdown = () => server.close(() => void pool.end());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
