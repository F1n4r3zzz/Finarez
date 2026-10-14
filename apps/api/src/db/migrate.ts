import { loadConfig } from '../config';
import { loadLocalEnv } from '../env';
import { createDatabase } from './client';
import { runMigrations } from './migrations';

loadLocalEnv();
const { db, pool } = createDatabase(loadConfig().DATABASE_URL, { max: 1 });
try {
  await runMigrations(db);
  console.log('Migrations applied');
} finally {
  await pool.end();
}
