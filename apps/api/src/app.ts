import { Hono } from 'hono';

export interface AppDeps {
  /** Resolves when the database answers; rejects otherwise. */
  checkDatabase: () => Promise<void>;
}

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath('/api');

  app.get('/health', async (c) => {
    try {
      await deps.checkDatabase();
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'unavailable' }, 503);
    }
  });

  return app;
}
