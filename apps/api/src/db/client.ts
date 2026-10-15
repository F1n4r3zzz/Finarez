import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

/**
 * A database handle or an open transaction. Use cases take an `Executor` so the caller owns the
 * transaction boundary and nested module calls share it.
 */
export type Executor = PgDatabase<NodePgQueryResultHKT>;

export type Database = ReturnType<typeof createDatabase>['db'];

/**
 * Asks for a fully verified TLS connection. Hosted URLs (Neon) say `sslmode=require`, which pg
 * treats as `verify-full` today but will weaken to libpq's meaning (no certificate check) in
 * its next major version; naming `verify-full` keeps today's protection. Local URLs, without
 * `sslmode`, are left alone.
 */
export function withVerifiedTls(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  const mode = url.searchParams.get('sslmode');
  if (mode !== 'require' && mode !== 'prefer' && mode !== 'verify-ca') return connectionString;
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

export function createDatabase(connectionString: string, options: { max?: number } = {}) {
  const pool = new Pool({
    connectionString: withVerifiedTls(connectionString),
    max: options.max ?? 10,
  });
  // Without a listener, an idle client's network error would crash the process.
  pool.on('error', (error) => console.error('PostgreSQL pool error:', error.message));
  const db = drizzle({ client: pool, casing: 'snake_case' });
  return { db, pool };
}
