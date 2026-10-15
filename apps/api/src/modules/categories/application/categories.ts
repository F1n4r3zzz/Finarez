import type { Category, CategoryInput, CategoryUpdate } from '@finanz/contracts';
import { asc, eq } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { uuidv7 } from '../../../platform/ids';
import { categories, seededUsers } from '../infra/schema';
import { DEFAULT_CATEGORIES } from './defaults';

export class CategoryNotFoundError extends Error {
  constructor() {
    super('Category not found');
    this.name = 'CategoryNotFoundError';
  }
}

/** A database rule rejected the change; `code` says which one, for the UI. */
export class CategoryConflictError extends Error {
  constructor(
    readonly code: 'category.invalid_parent' | 'category.has_children' | 'category.duplicate_name',
  ) {
    super(code);
    this.name = 'CategoryConflictError';
  }
}

type Row = typeof categories.$inferSelect;

function toCategory(row: Row): Category {
  return {
    id: row.id,
    kind: row.kind,
    parentId: row.parentId,
    name: row.name,
    archived: row.archivedAt !== null,
  };
}

/** Creates the default categories the first time; a no-op afterwards (safe under races). */
export async function ensureDefaultCategories(db: Executor, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const claimed = await tx
      .insert(seededUsers)
      .values({ userId })
      .onConflictDoNothing()
      .returning({ userId: seededUsers.userId });
    if (claimed.length === 0) return;
    const rows = (['income', 'expense'] as const).flatMap((kind) =>
      DEFAULT_CATEGORIES[kind].map((name) => ({ userId, id: uuidv7(), kind, name })),
    );
    await tx.insert(categories).values(rows);
  });
}

export async function listCategories(db: Executor, userId: string): Promise<Category[]> {
  await ensureDefaultCategories(db, userId);
  const rows = await db
    .select()
    .from(categories)
    .where(ownedBy(categories.userId, userId))
    .orderBy(asc(categories.kind), asc(categories.name));
  return rows.map(toCategory);
}

/** Maps the constraint a database error names to the rule the user broke. */
function conflictFrom(error: unknown): CategoryConflictError | undefined {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
  const { code, constraint } = cause as { code?: string; constraint?: string };
  if (code === '23505' && constraint === 'categories_unique_name') {
    return new CategoryConflictError('category.duplicate_name');
  }
  if ((code === '23503' || code === '23001') && constraint === 'categories_parent_fk') {
    // 23503: the parent isn't a root of the same kind (or isn't yours).
    // 23001 (RESTRICT): the category is referenced as a root, by its children or by itself.
    return new CategoryConflictError('category.invalid_parent');
  }
  return undefined;
}

async function withConflicts<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw conflictFrom(error) ?? error;
  }
}

export async function createCategory(
  db: Executor,
  userId: string,
  input: CategoryInput,
): Promise<Category> {
  await ensureDefaultCategories(db, userId);
  const [row] = await withConflicts(() =>
    db
      .insert(categories)
      .values({
        userId,
        id: uuidv7(),
        kind: input.kind,
        parentId: input.parentId ?? null,
        name: input.name,
      })
      .returning(),
  );
  if (!row) throw new Error('Insert returned no row');
  return toCategory(row);
}

export async function updateCategory(
  db: Executor,
  userId: string,
  id: string,
  input: CategoryUpdate,
): Promise<Category> {
  const changes: Partial<typeof categories.$inferInsert> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.parentId !== undefined) changes.parentId = input.parentId;
  if (input.archived !== undefined) changes.archivedAt = input.archived ? new Date() : null;
  if (input.parentId === id) throw new CategoryConflictError('category.invalid_parent');
  if (input.parentId) {
    // A category with active or archived subcategories can't become one itself.
    const [child] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(ownedBy(categories.userId, userId, eq(categories.parentId, id)))
      .limit(1);
    if (child) throw new CategoryConflictError('category.has_children');
  }
  const [row] = await withConflicts(() =>
    db
      .update(categories)
      .set(changes)
      .where(ownedBy(categories.userId, userId, eq(categories.id, id)))
      .returning(),
  );
  if (!row) throw new CategoryNotFoundError();
  return toCategory(row);
}
