import { loadConfig } from '../config';
import { loadLocalEnv } from '../env';
import { createDatabase } from './client';
import { runMigrations } from './migrations';

loadLocalEnv();
// Hosted databases give a direct (unpooled) URL for schema changes; locally there is only one.
const url = process.env.MIGRATION_DATABASE_URL ?? loadConfig().DATABASE_URL;
const { db, pool } = createDatabase(url, { max: 1 });
try {
  await runMigrations(db);
  console.log('Migrations applied');
} finally {
  await pool.end();
}
