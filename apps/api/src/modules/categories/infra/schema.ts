import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { usersTable } from '../../identity';

/** The categories module owns this Postgres schema (data-model §3). */
export const categoriesSchema = pgSchema('categories');

export const categories = categoriesSchema.table(
  'categories',
  {
    userId: text()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    id: uuid().notNull(),
    kind: text({ enum: ['income', 'expense'] }).notNull(),
    parentId: uuid(),
    name: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    isRoot: boolean().generatedAlwaysAs(sql`parent_id IS NULL`),
    /** Constant true: lets the parent foreign key require that the parent is a root. */
    parentMustBeRoot: boolean().generatedAlwaysAs(sql`true`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    unique('categories_kind_key').on(t.userId, t.id, t.kind),
    unique('categories_root_key').on(t.userId, t.id, t.kind, t.isRoot),
    // One level of subcategories: the parent must be a root of the same kind. Self-parenting,
    // chains and demoting a category that has children all fail here (data-model §3).
    foreignKey({
      name: 'categories_parent_fk',
      columns: [t.userId, t.parentId, t.kind, t.parentMustBeRoot],
      foreignColumns: [t.userId, t.id, t.kind, t.isRoot],
    }).onUpdate('restrict'),
    check('categories_kind', sql`${t.kind} in ('income', 'expense')`),
    check('categories_name', sql`length(trim(${t.name})) between 1 and 60`),
    // No two active categories with the same name in the same place (ignoring case).
    uniqueIndex('categories_unique_name')
      .on(t.userId, t.kind, sql`coalesce(${t.parentId}::text, '')`, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
  ],
);

/** Marks users whose default categories were created, so seeding happens exactly once. */
export const seededUsers = categoriesSchema.table('seeded_users', {
  userId: text()
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  seededAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
