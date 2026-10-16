import { CONSENT_KINDS, CONSENTS, type ConsentStatus, type Consents } from '@finanz/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { consents, users } from '../infra/schema';

/** What the user still has to accept at its current version. */
export async function consentStatus(db: Executor, userId: string): Promise<ConsentStatus> {
  const rows = await db
    .select({ kind: consents.kind, version: consents.version })
    .from(consents)
    .where(and(eq(consents.userId, userId), inArray(consents.kind, CONSENT_KINDS)));
  const accepted = new Set(rows.map((r) => `${r.kind}@${r.version}`));
  return { pending: CONSENT_KINDS.filter((k) => !accepted.has(`${k}@${CONSENTS[k]}`)) };
}

/**
 * Records that the user accepted `input` now. Accepting a version again keeps the first date.
 * A user id that doesn't exist records nothing (sign-up answers an address already taken with
 * a made-up user, so nobody learns which addresses have accounts).
 */
export async function recordConsents(db: Executor, userId: string, input: Consents) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!user) return;
  await db
    .insert(consents)
    .values(CONSENT_KINDS.map((kind) => ({ userId, kind, version: input[kind] })))
    .onConflictDoNothing();
}
