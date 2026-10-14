import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Database } from './db/client';
import { handleError } from './http/errors';
import { jsonBodiesOnly, sameOriginMutations } from './http/guards';
import { healthRoutes } from './http/health';
import { type Auth, meRoutes } from './modules/identity';
import { withEmailReservations } from './platform/email/budget';

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
  app.on(['GET', 'POST'], '/auth/*', async (c) => {
    const res = await withEmailReservations(() => auth.handler(c.req.raw));
    // Sessions, tokens and account data: never cached anywhere (Codex CP3 #4).
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'no-store');
    return out;
  });
  app.route('/me', meRoutes({ auth, db }));
  return app;
}
