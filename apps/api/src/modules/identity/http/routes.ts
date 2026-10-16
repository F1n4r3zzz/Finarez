import { consentsSchema, preferencesSchema } from '@finanz/contracts';
import { Hono } from 'hono';
import type { Database } from '../../../db/client';
import { consentStatus, recordConsents } from '../application/consents';
import { getPreferences, savePreferences } from '../application/preferences';
import type { Auth } from '../infra/auth';
import { requireUser, type UserVariables } from './require-user';

/** Routes about the signed-in user, mounted at /api/me. */
export function meRoutes({ auth, db }: { auth: Auth; db: Database }) {
  return (
    new Hono<{ Variables: UserVariables }>()
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
      })
      // The app asks for these before anything else when a version is new to the user.
      .get('/consents', async (c) => c.json(await consentStatus(db, c.var.userId)))
      .post('/consents', async (c) => {
        const parsed = consentsSchema.safeParse(await c.req.json());
        if (!parsed.success) {
          return c.json(
            { error: { code: 'consents.outdated', message: 'Accept the current versions' } },
            409,
          );
        }
        await recordConsents(db, c.var.userId, parsed.data);
        return c.json(await consentStatus(db, c.var.userId));
      })
  );
}
