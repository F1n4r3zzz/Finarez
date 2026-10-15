import { createHash } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { idempotencyKeys } from '../infra/schema';

/** The key was used before for a different command. */
export class IdempotencyKeyReusedError extends Error {
  constructor() {
    super('Idempotency-Key reused for a different request');
    this.name = 'IdempotencyKeyReusedError';
  }
}

export interface StoredResponse {
  status: number;
  body: unknown;
}

/** Key order doesn't change a command's identity. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function commandHash(command: {
  method: string;
  route: string;
  params: Record<string, string>;
  body: unknown;
}): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(command)))
    .digest('hex');
}

/**
 * Runs `work` at most once per (user, key), inside the caller's database transaction
 * (data-model §10). The claim, the financial writes and the stored response commit together;
 * a concurrent duplicate waits on the claim and then gets the stored response.
 */
export async function onceForKey(
  tx: Executor,
  userId: string,
  key: string,
  hash: string,
  work: () => Promise<StoredResponse>,
): Promise<StoredResponse & { replayed: boolean }> {
  await tx
    .delete(idempotencyKeys)
    .where(
      ownedBy(
        idempotencyKeys.userId,
        userId,
        lt(idempotencyKeys.createdAt, sql`now() - interval '24 hours'`),
      ),
    );
  const claimed = await tx
    .insert(idempotencyKeys)
    .values({ userId, key, commandSha256: hash })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  if (claimed.length === 0) {
    const [existing] = await tx
      .select()
      .from(idempotencyKeys)
      .where(ownedBy(idempotencyKeys.userId, userId, eq(idempotencyKeys.key, key)));
    if (!existing || existing.commandSha256 !== hash) throw new IdempotencyKeyReusedError();
    return { status: existing.responseStatus ?? 200, body: existing.response, replayed: true };
  }
  const response = await work();
  await tx
    .update(idempotencyKeys)
    .set({ responseStatus: response.status, response: response.body as object })
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
  return { ...response, replayed: false };
}
