import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Database } from './db/client';
import { handleError } from './http/errors';
import { jsonBodiesOnly, sameOriginMutations } from './http/guards';
import { healthRoutes } from './http/health';
import { budgetRoutes } from './modules/budgets';
import { categoryRoutes } from './modules/categories';
import { currencyRoutes } from './modules/currency';
import { debtRoutes } from './modules/debts';
import { type Auth, meRoutes } from './modules/identity';
import { ledgerRoutes } from './modules/ledger';
import { recurringRoutes } from './modules/recurring';
import { reportRoutes } from './modules/reporting';
import { savingsRoutes } from './modules/savings';
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
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));
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
  app.route('/currency', currencyRoutes({ auth, db }));
  app.route('/categories', categoryRoutes({ auth, db }));
  app.route('/ledger', ledgerRoutes({ auth, db }));
  app.route('/reports', reportRoutes({ auth, db }));
  app.route('/debts', debtRoutes({ auth, db }));
  app.route('/savings', savingsRoutes({ auth, db }));
  app.route('/budgets', budgetRoutes({ auth, db }));
  app.route('/recurring', recurringRoutes({ auth, db }));
  return app;
}
