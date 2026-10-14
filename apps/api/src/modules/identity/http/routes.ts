import { preferencesSchema } from '@finanz/contracts';
import { Hono } from 'hono';
import type { Database } from '../../../db/client';
import { getPreferences, savePreferences } from '../application/preferences';
import type { Auth } from '../infra/auth';
import { requireUser, type UserVariables } from './require-user';

/** Routes about the signed-in user, mounted at /api/me. */
export function meRoutes({ auth, db }: { auth: Auth; db: Database }) {
  return new Hono<{ Variables: UserVariables }>()
    .use(requireUser(auth))
    .get('/preferences', async (c) => {
      const saved = await getPreferences(db, c.var.userId);
      if (!saved) {
        return c.json(
          { error: { code: 'preferences.not_set', message: 'No preferences saved yet' } },
          404,
        );
      }
      return c.json(saved);
    })
    .put('/preferences', async (c) => {
      const input = preferencesSchema.parse(await c.req.json());
      return c.json(await savePreferences(db, c.var.userId, input));
    });
}
