import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Database } from './db/client';
import { handleError } from './http/errors';
import { healthRoutes } from './http/health';
import { type Auth, meRoutes } from './modules/identity';

export interface AppDeps {
  db: Database;
  auth: Auth;
}

export function createApp({ db, auth }: AppDeps) {
  const app = new Hono().basePath('/api');
  app.onError(handleError);
  app.route(
    '/health',
    healthRoutes(async () => {
      await db.execute(sql`select 1`);
    }),
  );
  app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));
  app.route('/me', meRoutes({ auth, db }));
  return app;
}
