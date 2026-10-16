import { FREQUENCIES } from '@finanz/kernel';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { usersTable } from '../../identity';
import { transactionsTable } from '../../ledger';

/** The recurring module owns this Postgres schema (data-model §8.2). */
export const recurringSchema = pgSchema('recurring');

const owner = () =>
  text()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' });

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const OCCURRENCE_STATUSES = ['pending', 'posted', 'skipped'] as const;

/** A movement that repeats: the template (a draft without its date) and when it happens. */
export const rules = recurringSchema.table(
  'rules',
  {
    userId: owner(),
    id: uuid().notNull(),
    /** Draft wire format without `occurredOn`: income, expense or transfer. */
    template: jsonb().notNull(),
    frequency: text({ enum: FREQUENCIES }).notNull(),
    /** A date it happens on: day of the month, weekday, or month and day. */
    anchorOn: date({ mode: 'string' }).notNull(),
    secondDay: smallint(),
    /** The next date to record or ask about; it only moves forward. */
    nextDueOn: date({ mode: 'string' }).notNull(),
    endsOn: date({ mode: 'string' }),
    confirm: boolean().notNull().default(false),
    endedAt: timestamp({ withTimezone: true }),
    version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    check('rules_frequency', sql`${t.frequency} in (${list(FREQUENCIES)})`),
    check(
      'rules_second_day',
      sql`(${t.frequency} = 'twice_monthly') = (${t.secondDay} is not null)
        and (${t.secondDay} is null or ${t.secondDay} between 1 and 31)`,
    ),
    check('rules_template_kind', sql`${t.template}->>'kind' in ('income', 'expense', 'transfer')`),
    index('rules_due').on(t.userId, t.nextDueOn),
  ],
);

/**
 * One date of a rule: recorded (with its transaction), waiting for the user, or skipped. The
 * primary key makes each date happen at most once, whatever runs at the same time.
 */
export const occurrences = recurringSchema.table(
  'occurrences',
  {
    userId: owner(),
    ruleId: uuid().notNull(),
    dueOn: date({ mode: 'string' }).notNull(),
    status: text({ enum: OCCURRENCE_STATUSES }).notNull(),
    transactionId: uuid(),
    /** The ledger error that stopped an automatic one, which then waits for the user. */
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.ruleId, t.dueOn] }),
    foreignKey({
      name: 'occurrences_rule_fk',
      columns: [t.userId, t.ruleId],
      foreignColumns: [rules.userId, rules.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'occurrences_transaction_fk',
      columns: [t.userId, t.transactionId],
      foreignColumns: [transactionsTable.userId, transactionsTable.id],
    }),
    unique('occurrences_one_per_transaction').on(t.userId, t.transactionId),
    check('occurrences_status', sql`${t.status} in (${list(OCCURRENCE_STATUSES)})`),
    check('occurrences_posted', sql`(${t.status} = 'posted') = (${t.transactionId} is not null)`),
    index('occurrences_pending').on(t.userId, t.dueOn).where(sql`${t.status} = 'pending'`),
  ],
);
