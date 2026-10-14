import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Database } from './db/client';
import { handleError } from './http/errors';
import { jsonBodiesOnly, sameOriginMutations } from './http/guards';
import { healthRoutes } from './http/health';
import { type Auth, meRoutes } from './modules/identity';

export interface AppDeps {
  db: Database;
  auth: Auth;
  /** Public origin of the web app; the only origin allowed to change data. */
  appUrl: string;
}

export function createApp({ db, auth, appUrl }: AppDeps) {
  const app = new Hono().basePath('/api');
  app.onError(handleError);
  app.use(secureHeaders());
  app.use(sameOriginMutations(appUrl));
  app.use(jsonBodiesOnly());
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
