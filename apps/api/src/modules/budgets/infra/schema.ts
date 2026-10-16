import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  foreignKey,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { categoriesTable } from '../../categories';
import { currenciesTable } from '../../currency';
import { usersTable } from '../../identity';
import { PERIOD_KINDS } from '../domain/periods';

/** The budgets module owns this Postgres schema (data-model §8.1). */
export const budgetsSchema = pgSchema('budgets');

const owner = () =>
  text()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' });

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** A spending limit for an expense category and its subcategories, per month, quarter or year. */
export const budgets = budgetsSchema.table(
  'budgets',
  {
    userId: owner(),
    id: uuid().notNull(),
    categoryId: uuid().notNull(),
    categoryKind: text().notNull(),
    period: text({ enum: PERIOD_KINDS }).notNull(),
    /** Fixed at creation, so the history is always measured in the same currency. */
    currency: char({ length: 3 })
      .notNull()
      .references(() => currenciesTable.code),
    carryover: boolean().notNull().default(false),
    /** The first day of the budget's first period. */
    startsOn: date({ mode: 'string' }).notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    // Only the user's own expense categories.
    foreignKey({
      name: 'budgets_category_fk',
      columns: [t.userId, t.categoryId, t.categoryKind],
      foreignColumns: [categoriesTable.userId, categoriesTable.id, categoriesTable.kind],
    }).onUpdate('restrict'),
    check('budgets_expense', sql`${t.categoryKind} = 'expense'`),
    check('budgets_period', sql`${t.period} in (${list(PERIOD_KINDS)})`),
    check(
      'budgets_starts_on_period',
      sql`extract(day from ${t.startsOn}) = 1 and (${t.period} = 'monthly'
        or (${t.period} = 'quarterly' and extract(month from ${t.startsOn}) in (1, 4, 7, 10))
        or (${t.period} = 'yearly' and extract(month from ${t.startsOn}) = 1))`,
    ),
    // One active budget per category; a parent and its subcategories may each have one.
    uniqueIndex('budgets_one_per_category')
      .on(t.userId, t.categoryId)
      .where(sql`${t.archivedAt} is null`),
  ],
);

/** A budget's limit from one period on, until the next row. Earlier periods keep theirs. */
export const limits = budgetsSchema.table(
  'limits',
  {
    userId: owner(),
    budgetId: uuid().notNull(),
    /** The first day of the first period this limit applies to. */
    effectiveFrom: date({ mode: 'string' }).notNull(),
    amountMinor: bigint({ mode: 'bigint' }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.budgetId, t.effectiveFrom] }),
    foreignKey({
      name: 'limits_budget_fk',
      columns: [t.userId, t.budgetId],
      foreignColumns: [budgets.userId, budgets.id],
    }).onDelete('cascade'),
    check('limits_amount', sql`${t.amountMinor} > 0`),
    check('limits_first_day', sql`extract(day from ${t.effectiveFrom}) = 1`),
  ],
);
