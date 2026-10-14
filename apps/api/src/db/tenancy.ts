import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * WHERE clause for rows owned by `userId`. Every query on user data starts from this, so a
 * request can never read, change or count another user's rows (ADR 0004). Composite
 * (user_id, id) foreign keys protect relationships; this protects every SELECT, UPDATE and
 * DELETE. Each module proves it with the tenant-isolation harness.
 */
export function ownedBy(
  userIdColumn: PgColumn,
  userId: string,
  ...conditions: (SQL | undefined)[]
): SQL {
  return and(eq(userIdColumn, userId), ...conditions) as SQL;
}
