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
    // Every schema the migrations own (one per module, plus drizzle's bookkeeping).
    const schemas = await db.execute<{ name: string }>(
      sql`select nspname as name from pg_namespace
          where nspname not like 'pg\_%' and nspname not in ('public', 'information_schema')`,
    );
    for (const { name } of schemas.rows) {
      await db.execute(sql`drop schema ${sql.identifier(name)} cascade`);
    }
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
