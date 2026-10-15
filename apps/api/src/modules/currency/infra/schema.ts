import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { usersTable } from '../../identity';

/** The currency module owns this Postgres schema (data-model §2). */
export const currencySchema = pgSchema('currency');

/** ISO 4217 codes with their minor units; every currency column references this. */
export const currencies = currencySchema.table('currencies', {
  code: char({ length: 3 }).primaryKey(),
  minorUnits: smallint().notNull(),
  active: boolean().notNull().default(true),
});

const code = () =>
  char({ length: 3 })
    .notNull()
    .references(() => currencies.code);

const rateColumns = {
  base: code(),
  quote: code(),
  /** Applies from this day until the next rate of the same pair (and source). */
  validFrom: date({ mode: 'string' }).notNull(),
  /** 1 base = rate quote, exact. Never stored inverted. */
  rate: numeric({ precision: 38, scale: 18 }).notNull(),
  recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

/** Shared reference rates from a provider. Rows are immutable revisions. */
export const providerRates = currencySchema.table(
  'provider_rates',
  {
    id: uuid().primaryKey(),
    source: text().notNull(),
    ...rateColumns,
    supersedesId: uuid().unique(),
  },
  (t) => [
    // A revision corrects a rate of the same source and pair.
    unique().on(t.id, t.source, t.base, t.quote),
    foreignKey({
      name: 'provider_rates_revision_fk',
      columns: [t.supersedesId, t.source, t.base, t.quote],
      foreignColumns: [t.id, t.source, t.base, t.quote],
    }),
    check('provider_rates_positive', sql`${t.rate} > 0`),
    check('provider_rates_pair', sql`${t.base} <> ${t.quote}`),
    index().on(t.base, t.quote, t.validFrom),
  ],
);

/** Rates the user types. Rows are immutable revisions; a correction supersedes a row. */
export const userRates = currencySchema.table(
  'user_rates',
  {
    userId: text()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    id: uuid().notNull(),
    ...rateColumns,
    supersedesId: uuid(),
    note: text(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    // A revision corrects a rate of the same pair, and each rate is corrected at most once.
    unique().on(t.userId, t.id, t.base, t.quote),
    foreignKey({
      name: 'user_rates_revision_fk',
      columns: [t.userId, t.supersedesId, t.base, t.quote],
      foreignColumns: [t.userId, t.id, t.base, t.quote],
    }),
    unique().on(t.userId, t.supersedesId),
    check('user_rates_positive', sql`${t.rate} > 0`),
    check('user_rates_pair', sql`${t.base} <> ${t.quote}`),
    index().on(t.userId, t.base, t.quote, t.validFrom),
  ],
);
