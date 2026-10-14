import type { Preferences } from '@finanz/contracts';
import { eq } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { preferences } from '../infra/schema';

/** `null` until the user (or the web app, on first sign-in) saves them. */
export async function getPreferences(db: Executor, userId: string): Promise<Preferences | null> {
  const [row] = await db
    .select({
      language: preferences.language,
      timeZone: preferences.timeZone,
      primaryCurrency: preferences.primaryCurrency,
    })
    .from(preferences)
    .where(eq(preferences.userId, userId));
  return (row as Preferences | undefined) ?? null;
}

/** Input must already be validated against `preferencesSchema`. */
export async function savePreferences(
  db: Executor,
  userId: string,
  input: Preferences,
): Promise<Preferences> {
  await db
    .insert(preferences)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: preferences.userId, set: { ...input, updatedAt: new Date() } });
  return input;
}
