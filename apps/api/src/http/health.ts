import { Hono } from 'hono';

/** Liveness plus database reachability. Reports nothing about why the database failed. */
export function healthRoutes(checkDatabase: () => Promise<void>) {
  return new Hono().get('/', async (c) => {
    try {
      await checkDatabase();
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'unavailable' }, 503);
    }
  });
}
