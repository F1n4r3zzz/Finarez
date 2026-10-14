import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

/**
 * A database handle or an open transaction. Use cases take an `Executor` so the caller owns the
 * transaction boundary and nested module calls share it.
 */
export type Executor = PgDatabase<NodePgQueryResultHKT>;

export function createDatabase(connectionString: string, options: { max?: number } = {}) {
  const pool = new Pool({ connectionString, max: options.max ?? 10 });
  // Without a listener, an idle client's network error would crash the process.
  pool.on('error', (error) => console.error('PostgreSQL pool error:', error.message));
  const db = drizzle({ client: pool, casing: 'snake_case' });
  return { db, pool };
}
