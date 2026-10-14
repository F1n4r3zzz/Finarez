import { date, integer, pgSchema } from 'drizzle-orm/pg-core';

export const platform = pgSchema('platform');

/** Emails sent per UTC day, shared by every API instance. */
export const emailSends = platform.table('email_sends', {
  day: date().primaryKey(),
  count: integer().notNull(),
});
