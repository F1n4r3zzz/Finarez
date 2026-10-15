import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../test/database';
import { createDatabase } from './client';
import { runMigrations } from './migrations';

describe('migrations', () => {
  it('build the whole schema on an empty database, and re-running them is harmless', async () => {
    const name = `finanz_mig_${process.pid}_${Date.now()}`;
    const admin = createDatabase(testDatabaseUrl(), { max: 1 });
    await admin.db.execute(sql.raw(`create database ${name}`));
    const url = new URL(testDatabaseUrl());
    url.pathname = `/${name}`;
    const fresh = createDatabase(url.toString(), { max: 1 });
    try {
      await runMigrations(fresh.db);
      await runMigrations(fresh.db);
      const tables = await fresh.db.execute<{ t: string }>(
        sql`select table_schema || '.' || table_name as t from information_schema.tables
            where table_schema in ('identity', 'platform', 'currency', 'categories') order by 1`,
      );
      expect(tables.rows.map((r) => r.t)).toEqual([
        'categories.categories',
        'categories.seeded_users',
        'currency.currencies',
        'currency.provider_rates',
        'currency.user_rates',
        'identity.accounts',
        'identity.preferences',
        'identity.rate_limits',
        'identity.sessions',
        'identity.users',
        'identity.verifications',
        'platform.email_sends',
      ]);
    } finally {
      await fresh.pool.end();
      await admin.db.execute(sql.raw(`drop database ${name}`));
      await admin.pool.end();
    }
  });
});
