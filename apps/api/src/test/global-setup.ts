import { sql } from 'drizzle-orm';
import { createDatabase } from '../db/client';
import { runMigrations } from '../db/migrations';
import { loadLocalEnv } from '../env';
import { testDatabaseUrl } from './database';

/** Before the API tests: rebuild the test database's schemas from the migrations. */
export default async function setup(): Promise<void> {
  loadLocalEnv();
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to reset "${name}": the test database name must end in _test`);
  }
  const { db, pool } = createDatabase(url, { max: 1 });
  try {
    await db.execute(sql`drop schema if exists identity, platform, drizzle cascade`);
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
