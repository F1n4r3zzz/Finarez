import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { pgErrorCode, testDatabaseUrl } from '../test/database';
import { createDatabase, type Database } from './client';
import { APP_ROLE, BACKUP_ROLE, MIGRATIONS_FOLDER, runMigrations } from './migrations';

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
            where table_schema in ('identity', 'platform', 'currency', 'categories', 'ledger', 'debts') order by 1`,
      );
      expect(tables.rows.map((r) => r.t)).toEqual([
        'categories.categories',
        'categories.seeded_users',
        'currency.currencies',
        'currency.provider_rates',
        'currency.user_rates',
        'debts.debt_payments',
        'debts.debts',
        'identity.accounts',
        'identity.preferences',
        'identity.rate_limits',
        'identity.sessions',
        'identity.users',
        'identity.verifications',
        'ledger.accounts',
        'ledger.entries',
        'ledger.idempotency_keys',
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

/** Creating logins needs a superuser: true in CI, usually not for a local `finanz` role. */
async function isSuperuser(): Promise<boolean> {
  const { db, pool } = createDatabase(testDatabaseUrl(), { max: 1 });
  try {
    const me = await db.execute<{ yes: boolean }>(
      sql`select rolsuper as yes from pg_roles where rolname = current_user`,
    );
    return me.rows[0]?.yes === true;
  } finally {
    await pool.end();
  }
}

/** Runs `work` as `role` inside a transaction that is always rolled back. */
async function as(db: Database, role: string, work: (tx: Database) => Promise<unknown>) {
  const rollback = new Error('rollback');
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local role ${sql.identifier(role)}`);
      await work(tx as unknown as Database);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function denied(db: Database, role: string, statement: ReturnType<typeof sql>) {
  const error = await as(db, role, (tx) => tx.execute(statement)).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(pgErrorCode(error), String(statement.queryChunks)).toBe('42501');
}

describe.skipIf(!(await isSuperuser()))('database logins', () => {
  it('let the app change rows but not the schema or the history, and the backup only read', async () => {
    await withFreshDatabase(async (db) => {
      for (const role of [APP_ROLE, BACKUP_ROLE]) {
        await db.execute(
          sql.raw(`do $$ begin
          if not exists (select from pg_roles where rolname = '${role}') then create role ${role}; end if;
          end $$`),
        );
      }
      await runMigrations(db);

      await as(db, APP_ROLE, async (tx) => {
        await tx.execute(
          sql`insert into identity.users (id, name, email) values ('u1', '', 'u1@example.com')`,
        );
        await tx.execute(sql`update identity.users set name = 'Ana' where id = 'u1'`);
        await tx.execute(sql`insert into currency.user_rates (user_id, id, base, quote, valid_from, rate)
          values ('u1', '01900000-0000-7000-8000-000000000001', 'USD', 'COP', '2026-01-01', 4000)`);
        // Deleting the user still removes rows the app itself may never delete.
        await tx.execute(sql`delete from identity.users where id = 'u1'`);
        const left = await tx.execute<{ n: number }>(
          sql`select count(*)::int as n from currency.user_rates`,
        );
        expect(left.rows[0]?.n).toBe(0);
      });
      await denied(db, APP_ROLE, sql`update currency.user_rates set rate = 1`);
      await denied(db, APP_ROLE, sql`delete from ledger.transaction_audit`);
      await denied(db, APP_ROLE, sql`delete from ledger.transactions`);
      for (const table of [
        'ledger.accounts',
        'categories.categories',
        'debts.debts',
        'debts.debt_payments',
        'savings.goals',
        'savings.allocations',
        'budgets.budgets',
        'recurring.rules',
        'recurring.occurrences',
      ]) {
        await denied(db, APP_ROLE, sql.raw(`delete from ${table}`));
      }
      // Budget limits are replaced when a limit changes from a month on.
      await as(db, APP_ROLE, (tx) => tx.execute(sql`delete from budgets.limits`));
      await denied(db, APP_ROLE, sql`truncate identity.users cascade`);
      await denied(db, APP_ROLE, sql`create table ledger.extra (id int)`);
      await denied(db, APP_ROLE, sql`drop table ledger.entries`);
      await denied(db, APP_ROLE, sql`alter table ledger.transaction_audit disable trigger all`);
      await denied(db, APP_ROLE, sql`select * from drizzle.__drizzle_migrations`);

      // Every table, including ones later migrations add, is readable by the backup.
      const tables = await db.execute<{ t: string }>(
        sql`select schemaname || '.' || tablename as t from pg_tables
            where tableowner = current_user
              and schemaname not in ('pg_catalog', 'information_schema', 'public')`,
      );
      expect(tables.rows.length).toBeGreaterThan(20);
      await as(db, BACKUP_ROLE, async (tx) => {
        for (const { t } of tables.rows) await tx.execute(sql.raw(`select count(*) from ${t}`));
      });
      await denied(
        db,
        BACKUP_ROLE,
        sql`insert into identity.users (id, name, email) values ('u2', '', 'u2@example.com')`,
      );
    });
  });
});
