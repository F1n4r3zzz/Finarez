import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  date,
  foreignKey,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { categoriesTable } from '../../categories';
import { usersTable } from '../../identity';
import { accountsTable, transactionsTable } from '../../ledger';

/** The debts module owns this Postgres schema (data-model §6). */
export const debtsSchema = pgSchema('debts');

const owner = () =>
  text()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' });

/**
 * Terms of a loan or credit card. What is owed is never stored here: it is the balance of the
 * liability account in the ledger.
 */
export const debts = debtsSchema.table(
  'debts',
  {
    userId: owner(),
    id: uuid().notNull(),
    accountId: uuid().notNull(),
    currency: char({ length: 3 }).notNull(),
    accountKind: text().notNull(),
    type: text({ enum: ['loan', 'credit_card'] }).notNull(),
    /** Interest per period as an exact decimal fraction (0.012 = 1,2 %); null = no interest. */
    rate: numeric({ precision: 20, scale: 12 }),
    ratePeriod: text({ enum: ['monthly', 'annual'] }),
    originalPrincipalMinor: bigint({ mode: 'bigint' }),
    termMonths: integer(),
    installmentMinor: bigint({ mode: 'bigint' }),
    startOn: date({ mode: 'string' }),
    dueDay: smallint(),
    statementDay: smallint(),
    creditLimitMinor: bigint({ mode: 'bigint' }),
    /** Category for the interest part of payments (an expense category). */
    interestCategoryId: uuid(),
    interestCategoryKind: text().generatedAlwaysAs(sql`'expense'`),
    /** Lenders round interest to this many minor units (100 = whole pesos). */
    roundingMinor: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    unique('debts_one_per_account').on(t.userId, t.accountId),
    foreignKey({
      name: 'debts_account_fk',
      columns: [t.userId, t.accountId, t.currency, t.accountKind],
      foreignColumns: [
        accountsTable.userId,
        accountsTable.id,
        accountsTable.currency,
        accountsTable.kind,
      ],
    }).onUpdate('restrict'),
    foreignKey({
      name: 'debts_interest_category_fk',
      columns: [t.userId, t.interestCategoryId, t.interestCategoryKind],
      foreignColumns: [categoriesTable.userId, categoriesTable.id, categoriesTable.kind],
    }).onUpdate('restrict'),
    check('debts_liability', sql`${t.accountKind} = 'liability'`),
    check('debts_type', sql`${t.type} in ('loan', 'credit_card')`),
    check(
      'debts_rate',
      sql`(${t.rate} is null) = (${t.ratePeriod} is null) and (${t.rate} is null or ${t.rate} >= 0)`,
    ),
    check(
      'debts_days',
      sql`(${t.dueDay} is null or ${t.dueDay} between 1 and 31) and (${t.statementDay} is null or ${t.statementDay} between 1 and 31)`,
    ),
    check('debts_term', sql`${t.termMonths} is null or ${t.termMonths} between 1 and 600`),
    check('debts_rounding', sql`${t.roundingMinor} >= 1`),
    check(
      'debts_amounts',
      sql`(${t.originalPrincipalMinor} is null or ${t.originalPrincipalMinor} > 0)
      and (${t.installmentMinor} is null or ${t.installmentMinor} > 0)
      and (${t.creditLimitMinor} is null or ${t.creditLimitMinor} > 0)`,
    ),
  ],
);

/** Which ledger transactions are payments of which debt. The split is read from the entries. */
export const debtPayments = debtsSchema.table(
  'debt_payments',
  {
    userId: owner(),
    debtId: uuid().notNull(),
    transactionId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.transactionId] }),
    foreignKey({
      name: 'debt_payments_debt_fk',
      columns: [t.userId, t.debtId],
      foreignColumns: [debts.userId, debts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'debt_payments_transaction_fk',
      columns: [t.userId, t.transactionId],
      foreignColumns: [transactionsTable.userId, transactionsTable.id],
    }),
  ],
);
