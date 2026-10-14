import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config';
import { loadLocalEnv } from '../env';
import { createDatabase } from './client';

loadLocalEnv();
const { db, pool } = createDatabase(loadConfig().DATABASE_URL, { max: 1 });
try {
  await migrate(db, {
    migrationsFolder: new URL('../../migrations', import.meta.url).pathname,
    migrationsSchema: 'drizzle',
  });
  console.log('Migrations applied');
} finally {
  await pool.end();
}
