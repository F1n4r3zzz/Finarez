import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../test/database';
import { createDatabase, type Database } from './client';
import { MIGRATIONS_FOLDER, runMigrations } from './migrations';

/** A throwaway database for one test, dropped afterwards. */
async function withFreshDatabase(work: (db: Database) => Promise<void>): Promise<void> {
  const name = `finanz_mig_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = createDatabase(testDatabaseUrl(), { max: 1 });
  await admin.db.execute(sql.raw(`create database ${name}`));
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${name}`;
  const fresh = createDatabase(url.toString(), { max: 1 });
  try {
    await work(fresh.db);
  } finally {
    await fresh.pool.end();
    await admin.db.execute(sql.raw(`drop database ${name}`));
    await admin.pool.end();
  }
}

/** Applies the migrations up to and including `tag`, as an older release would have. */
async function migrateTo(db: Database, tag: string): Promise<void> {
  const journal = JSON.parse(
    await readFile(join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8'),
  ) as {
    entries: { tag: string }[];
  };
  const last = journal.entries.findIndex((e) => e.tag === tag);
  if (last < 0) throw new Error(`No migration ${tag}`);
  const folder = await mkdtemp(join(tmpdir(), 'finanz-migrations-'));
  try {
    await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
    const partial = { ...journal, entries: journal.entries.slice(0, last + 1) };
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(partial));
    await migrate(db, { migrationsFolder: folder, migrationsSchema: 'drizzle' });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

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
            where table_schema in ('identity', 'platform', 'currency', 'categories', 'ledger') order by 1`,
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
        'ledger.accounts',
        'ledger.entries',
        'ledger.transaction_audit',
        'ledger.transactions',
        'platform.email_sends',
      ]);
    } finally {
      await fresh.pool.end();
      await admin.db.execute(sql.raw(`drop database ${name}`));
      await admin.pool.end();
    }
  });

  it('upgrade a database that already holds data from earlier releases, keeping it', async () => {
    await withFreshDatabase(async (db) => {
      await migrateTo(db, '0000_init');
      await db.execute(
        sql`insert into identity.users (id, name, email) values ('u1', '', 'u1@example.com')`,
      );
      await db.execute(sql`insert into identity.preferences (user_id, language, time_zone, primary_currency)
        values ('u1', 'es', 'America/Bogota', 'COP')`);

      await migrateTo(db, '0002_categories');
      await db.execute(sql`insert into currency.user_rates (user_id, id, base, quote, valid_from, rate)
        values ('u1', '01900000-0000-7000-8000-000000000001', 'USD', 'COP', '2026-01-01', 4000)`);
      await db.execute(sql`insert into categories.categories (user_id, id, kind, name)
        values ('u1', '01900000-0000-7000-8000-000000000002', 'expense', 'Mercado')`);

      await runMigrations(db);
      const kept = await db.execute<{ n: number }>(sql`select
        (select count(*) from identity.preferences where user_id = 'u1')
        + (select count(*) from currency.user_rates where user_id = 'u1')
        + (select count(*) from categories.categories where user_id = 'u1') as n`);
      expect(Number(kept.rows[0]?.n)).toBe(3);

      // The upgraded data works with the newest tables.
      await db.transaction(async (tx) => {
        await tx.execute(sql`insert into ledger.accounts (user_id, id, kind, subtype, currency, name, opened_on, system_role) values
          ('u1', '01900000-0000-7000-8000-000000000003', 'asset', 'bank', 'COP', 'Banco', '2026-01-01', null),
          ('u1', '01900000-0000-7000-8000-000000000004', 'expense', null, 'COP', 'Gastos', '2026-01-01', 'expense')`);
        await tx.execute(sql`insert into ledger.transactions (user_id, id, occurred_on, kind, status, description)
          values ('u1', '01900000-0000-7000-8000-000000000005', '2026-01-02', 'expense', 'posted', 'Mercado')`);
        await tx.execute(sql`insert into ledger.entries (user_id, id, transaction_id, occurred_on, account_id, account_kind, currency, amount_minor, category_id, category_kind) values
          ('u1', '01900000-0000-7000-8000-000000000006', '01900000-0000-7000-8000-000000000005', '2026-01-02', '01900000-0000-7000-8000-000000000003', 'asset', 'COP', -5000, null, null),
          ('u1', '01900000-0000-7000-8000-000000000007', '01900000-0000-7000-8000-000000000005', '2026-01-02', '01900000-0000-7000-8000-000000000004', 'expense', 'COP', 5000, '01900000-0000-7000-8000-000000000002', 'expense')`);
      });
    });
  });
});
