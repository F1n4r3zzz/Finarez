import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './client';

export const MIGRATIONS_FOLDER = new URL('../../migrations', import.meta.url).pathname;

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: 'drizzle' });
}
