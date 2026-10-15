import type { Database, Executor } from './client';

/** SQLSTATEs where retrying the whole unit is the right answer: deadlock, serialization. */
const RETRYABLE = new Set(['40P01', '40001']);

function sqlState(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.cause?.code ?? e.code;
}

/**
 * Runs `work` in one database transaction, retrying the whole unit (up to 3 attempts) when
 * PostgreSQL aborts it to break a deadlock or a serialization conflict (data-model §4.4).
 */
export async function inUnitOfWork<T>(
  db: Database,
  work: (tx: Executor) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(work);
    } catch (error) {
      if (attempt >= attempts || !RETRYABLE.has(sqlState(error) ?? '')) throw error;
    }
  }
}

/**
 * Runs related reads against one consistent snapshot (read-only, REPEATABLE READ), so a write
 * committed between them can't make a report mix two states of the ledger (CP2 code #2).
 */
export function inSnapshot<T>(db: Database, work: (tx: Executor) => Promise<T>): Promise<T> {
  return db.transaction(work, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
