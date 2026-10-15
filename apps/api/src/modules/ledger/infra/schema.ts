import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { categoriesTable } from '../../categories';
import { currenciesTable } from '../../currency';
import { usersTable } from '../../identity';
import {
  ACCOUNT_KINDS,
  ASSET_SUBTYPES,
  AUDIT_ACTIONS,
  AUDIT_SOURCES,
  LIABILITY_SUBTYPES,
  MANAGING_MODULES,
  SYSTEM_ROLES,
  TRANSACTION_KINDS,
  TRANSACTION_STATUSES,
} from '../domain/kinds';

/** The ledger module owns this Postgres schema (data-model §4). */
export const ledger = pgSchema('ledger');

const owner = () =>
  text()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' });

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const accounts = ledger.table(
  'accounts',
  {
    userId: owner(),
    id: uuid().notNull(),
    kind: text({ enum: ACCOUNT_KINDS }).notNull(),
    subtype: text(),
    currency: char({ length: 3 })
      .notNull()
      .references(() => currenciesTable.code),
    name: text().notNull(),
    institution: text(),
    openedOn: date({ mode: 'string' }).notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    /** Set only on hidden accounts: one per role and currency. */
    systemRole: text({ enum: SYSTEM_ROLES }),
    version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    // The one target for every foreign key that needs currency or kind (data-model §4.1).
    unique('accounts_entry_key').on(t.userId, t.id, t.currency, t.kind),
    uniqueIndex('accounts_system_role')
      .on(t.userId, t.systemRole, t.currency)
      .where(sql`${t.systemRole} is not null`),
    check(
      'accounts_kind_shape',
      sql`(${t.systemRole} is null and ${t.kind} = 'asset' and ${t.subtype} in (${list(ASSET_SUBTYPES)}))
       or (${t.systemRole} is null and ${t.kind} = 'liability' and ${t.subtype} in (${list(LIABILITY_SUBTYPES)}))
       or (${t.systemRole} = 'income' and ${t.kind} = 'income' and ${t.subtype} is null)
       or (${t.systemRole} = 'expense' and ${t.kind} = 'expense' and ${t.subtype} is null)
       or (${t.systemRole} in ('opening_balance', 'valuation') and ${t.kind} = 'equity' and ${t.subtype} is null)
       or (${t.systemRole} = 'fx' and ${t.kind} = 'clearing' and ${t.subtype} is null)`,
    ),
    check('accounts_name', sql`length(trim(${t.name})) between 1 and 80`),
  ],
);

export const transactions = ledger.table(
  'transactions',
  {
    userId: owner(),
    id: uuid().notNull(),
    occurredOn: date({ mode: 'string' }).notNull(),
    kind: text({ enum: TRANSACTION_KINDS }).notNull(),
    status: text({ enum: TRANSACTION_STATUSES }).notNull(),
    managedBy: text({ enum: MANAGING_MODULES }),
    description: text().notNull(),
    payee: text(),
    notes: text(),
    version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    unique('transactions_dated_key').on(t.userId, t.id, t.occurredOn),
    check('transactions_kind', sql`${t.kind} in (${list(TRANSACTION_KINDS)})`),
    check('transactions_status', sql`${t.status} in (${list(TRANSACTION_STATUSES)})`),
    check(
      'transactions_managed_by',
      sql`${t.managedBy} is null or ${t.managedBy} in (${list(MANAGING_MODULES)})`,
    ),
    check('transactions_version', sql`${t.version} >= 1`),
    index().on(t.userId, t.occurredOn),
  ],
);

export const entries = ledger.table(
  'entries',
  {
    userId: owner(),
    id: uuid().notNull(),
    transactionId: uuid().notNull(),
    /** Always the transaction's date (cascaded), so range sums need no join. */
    occurredOn: date({ mode: 'string' }).notNull(),
    accountId: uuid().notNull(),
    accountKind: text({ enum: ACCOUNT_KINDS }).notNull(),
    currency: char({ length: 3 }).notNull(),
    amountMinor: bigint({ mode: 'bigint' }).notNull(),
    categoryId: uuid(),
    categoryKind: text({ enum: ['income', 'expense'] }),
    memo: text(),
    reconciledAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    foreignKey({
      name: 'entries_transaction_fk',
      columns: [t.userId, t.transactionId, t.occurredOn],
      foreignColumns: [transactions.userId, transactions.id, transactions.occurredOn],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    // An entry is in its account's currency and knows the account's kind (CP1 #1).
    foreignKey({
      name: 'entries_account_fk',
      columns: [t.userId, t.accountId, t.currency, t.accountKind],
      foreignColumns: [accounts.userId, accounts.id, accounts.currency, accounts.kind],
    }).onUpdate('restrict'),
    foreignKey({
      name: 'entries_category_fk',
      columns: [t.userId, t.categoryId, t.categoryKind],
      foreignColumns: [categoriesTable.userId, categoriesTable.id, categoriesTable.kind],
    }).onUpdate('restrict'),
    check('entries_amount', sql`${t.amountMinor} <> 0`),
    // Both set or both empty, so the category key is either fully checked or not applicable.
    check('entries_category_pair', sql`(${t.categoryId} is null) = (${t.categoryKind} is null)`),
    check(
      'entries_category_required',
      sql`(${t.accountKind} in ('income', 'expense')) = (${t.categoryId} is not null)`,
    ),
    check(
      'entries_category_kind',
      sql`${t.categoryKind} is null or ${t.categoryKind} = ${t.accountKind}`,
    ),
    // One movement per user account per transaction: a statement row is one ledger leg.
    uniqueIndex('entries_one_leg_per_account')
      .on(t.userId, t.transactionId, t.accountId)
      .where(sql`${t.accountKind} in ('asset', 'liability')`),
    index().on(t.userId, t.accountId, t.occurredOn),
    index().on(t.userId, t.categoryId, t.occurredOn),
    index().on(t.userId, t.transactionId),
  ],
);

/** Append-only history of every create, edit, void and restore (data-model §4.5). */
export const transactionAudit = ledger.table(
  'transaction_audit',
  {
    userId: owner(),
    id: uuid().notNull(),
    transactionId: uuid().notNull(),
    version: integer().notNull(),
    action: text({ enum: AUDIT_ACTIONS }).notNull(),
    source: text({ enum: AUDIT_SOURCES }).notNull(),
    actorUserId: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    before: jsonb(),
    after: jsonb(),
    reconciledChange: boolean().notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    foreignKey({
      name: 'transaction_audit_transaction_fk',
      columns: [t.userId, t.transactionId],
      foreignColumns: [transactions.userId, transactions.id],
    }).onDelete('cascade'),
    check('transaction_audit_action', sql`${t.action} in (${list(AUDIT_ACTIONS)})`),
    check('transaction_audit_source', sql`${t.source} in (${list(AUDIT_SOURCES)})`),
    index().on(t.userId, t.transactionId, t.version),
  ],
);

/** Financial requests' Idempotency-Key claims, kept 24 hours (data-model §10). */
export const idempotencyKeys = ledger.table(
  'idempotency_keys',
  {
    userId: owner(),
    key: text().notNull(),
    /** Method, route, path parameters and canonical body: one key, one command. */
    commandSha256: text().notNull(),
    responseStatus: integer(),
    response: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key] }),
    check('idempotency_keys_key', sql`length(${t.key}) between 1 and 200`),
  ],
);
