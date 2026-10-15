import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  date,
  foreignKey,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { usersTable } from '../../identity';
import { accountsTable, transactionsTable } from '../../ledger';

/** The savings module owns this Postgres schema (data-model §7). */
export const savingsSchema = pgSchema('savings');

const owner = () =>
  text()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' });

/** A savings goal: a target amount, by a date if the user gives one. */
export const goals = savingsSchema.table(
  'goals',
  {
    userId: owner(),
    id: uuid().notNull(),
    name: text().notNull(),
    currency: char({ length: 3 }).notNull(),
    targetMinor: bigint({ mode: 'bigint' }).notNull(),
    targetDate: date({ mode: 'string' }),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    check('goals_target', sql`${t.targetMinor} > 0`),
    check('goals_name', sql`length(trim(${t.name})) between 1 and 80`),
    uniqueIndex('goals_unique_name')
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
  ],
);

/**
 * Money set aside for a goal in one account (positive) or released from it (negative). An
 * earmark over the account's balance, not a movement: it never touches the ledger, except the
 * transfer Finanz records when a contribution also moved the money (`transaction_id`).
 */
export const allocations = savingsSchema.table(
  'allocations',
  {
    userId: owner(),
    id: uuid().notNull(),
    goalId: uuid().notNull(),
    accountId: uuid().notNull(),
    currency: char({ length: 3 }).notNull(),
    accountKind: text().notNull(),
    amountMinor: bigint({ mode: 'bigint' }).notNull(),
    occurredOn: date({ mode: 'string' }).notNull(),
    transactionId: uuid(),
    note: text(),
    voidedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    foreignKey({
      name: 'allocations_goal_fk',
      columns: [t.userId, t.goalId],
      foreignColumns: [goals.userId, goals.id],
    }),
    // Only the user's own asset accounts, in their own currency (data-model §7).
    foreignKey({
      name: 'allocations_account_fk',
      columns: [t.userId, t.accountId, t.currency, t.accountKind],
      foreignColumns: [
        accountsTable.userId,
        accountsTable.id,
        accountsTable.currency,
        accountsTable.kind,
      ],
    }).onUpdate('restrict'),
    foreignKey({
      name: 'allocations_transaction_fk',
      columns: [t.userId, t.transactionId],
      foreignColumns: [transactionsTable.userId, transactionsTable.id],
    }),
    unique('allocations_one_per_transaction').on(t.userId, t.transactionId),
    check('allocations_asset', sql`${t.accountKind} = 'asset'`),
    check('allocations_amount', sql`${t.amountMinor} <> 0`),
    check('allocations_note', sql`${t.note} is null or length(trim(${t.note})) between 1 and 200`),
    index('allocations_by_goal').on(t.userId, t.goalId),
    index('allocations_by_account').on(t.userId, t.accountId),
  ],
);
