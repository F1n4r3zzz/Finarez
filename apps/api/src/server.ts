import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';
import { loadLocalEnv } from './env';

loadLocalEnv();
const config = loadConfig();
const { db, pool } = createDatabase(config.DATABASE_URL);

const app = createApp({
  checkDatabase: async () => {
    await db.execute(sql`select 1`);
  },
});

const server = serve({ fetch: app.fetch, port: config.PORT });
console.log(`API listening on http://localhost:${config.PORT}/api`);

const shutdown = () => server.close(() => void pool.end());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
