import {
  bigint,
  boolean,
  char,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/** The identity module owns this Postgres schema. Other modules reference users.id only. */
export const identity = pgSchema('identity');

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

// Tables required by Better Auth (field names must match its models exactly).

export const users = identity.table('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  ...timestamps,
});

export const sessions = identity.table(
  'sessions',
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const accounts = identity.table(
  'accounts',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const verifications = identity.table(
  'verifications',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.identifier)],
);

/** Rate-limit counters, shared by every API instance (works on serverless). */
export const rateLimits = identity.table('rate_limits', {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: 'number' }).notNull(),
});

// Finarez's own identity data.

export const preferences = identity.table('preferences', {
  userId: text()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  language: text().notNull(),
  timeZone: text().notNull(),
  primaryCurrency: char({ length: 3 }).notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
