import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './client';

export const MIGRATIONS_FOLDER = new URL('../../migrations', import.meta.url).pathname;

/**
 * Hosted databases give the running API and the nightly backup their own logins, created once
 * per environment outside the migrations (README, "Database logins"). The migrations keep the
 * owner login. Locally neither exists and the owner does everything.
 */
export const APP_ROLE = 'finanz_app';
export const BACKUP_ROLE = 'finanz_backup';

/** Rows the app adds but never changes; triggers forbid it too, privileges hold even without them. */
const NEVER_CHANGED = [
  'ledger.transaction_audit',
  'currency.user_rates',
  'currency.provider_rates',
];
/** Rows the app never deletes (transactions are voided). Deleting a user still cascades. */
const NEVER_DELETED = ['ledger.transactions'];

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: 'drizzle' });
  await grantLogins(db);
}

/**
 * Gives the logins that exist access to every schema the migrations own: the app reads and
 * writes rows but can't change the schema or rewrite history; the backup only reads, including
 * the migrations journal. Runs after every migration, so new tables are covered.
 */
async function grantLogins(db: Database): Promise<void> {
  const roles = await db.execute<{ name: string }>(
    sql`select rolname as name from pg_roles where rolname in (${APP_ROLE}, ${BACKUP_ROLE})`,
  );
  const present = new Set(roles.rows.map((r) => r.name));
  if (present.size === 0) return;
  const schemas = await db.execute<{ name: string }>(
    sql`select nspname as name from pg_namespace
        where nspowner = (select oid from pg_roles where rolname = current_user)
          and nspname not like 'pg\_%' and nspname <> 'public'
        order by 1`,
  );
  await db.transaction(async (tx) => {
    for (const { name } of schemas.rows) {
      const schema = sql.identifier(name);
      if (present.has(APP_ROLE) && name !== 'drizzle') {
        const app = sql.identifier(APP_ROLE);
        await tx.execute(sql`grant usage on schema ${schema} to ${app}`);
        await tx.execute(
          sql`grant select, insert, update, delete on all tables in schema ${schema} to ${app}`,
        );
      }
      if (present.has(BACKUP_ROLE)) {
        const backup = sql.identifier(BACKUP_ROLE);
        await tx.execute(sql`grant usage on schema ${schema} to ${backup}`);
        await tx.execute(sql`grant select on all tables in schema ${schema} to ${backup}`);
        await tx.execute(sql`grant select on all sequences in schema ${schema} to ${backup}`);
      }
    }
    if (present.has(APP_ROLE)) {
      const app = sql.identifier(APP_ROLE);
      for (const table of NEVER_CHANGED) {
        await tx.execute(sql`revoke update, delete on ${sql.raw(table)} from ${app}`);
      }
      for (const table of NEVER_DELETED) {
        await tx.execute(sql`revoke delete on ${sql.raw(table)} from ${app}`);
      }
    }
  });
}
