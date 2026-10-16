import type { Category, CategoryInput, CategoryUpdate } from '@finanz/contracts';
import { and, asc, eq, isNull, lt } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { uuidv7 } from '../../../platform/ids';
import { categories, seededUsers } from '../infra/schema';
import { DEFAULT_CATEGORIES, DEFAULTS_VERSION, V1_TELECOM, V1_UTILITIES } from './defaults';

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

type Kind = 'income' | 'expense';

/** Adds the subcategories in `names` that `parent` doesn't have yet (ignoring case). */
async function addChildren(
  tx: Executor,
  userId: string,
  parent: { id: string; kind: Kind },
  existing: readonly Row[],
  names: readonly string[],
) {
  const taken = new Set(
    existing.filter((c) => c.parentId === parent.id).map((c) => c.name.toLowerCase()),
  );
  const rows = names
    .filter((name) => !taken.has(name.toLowerCase()))
    .map((name) => ({ userId, id: uuidv7(), kind: parent.kind, name, parentId: parent.id }));
  if (rows.length) await tx.insert(categories).values(rows);
}

async function insertDefaults(tx: Executor, userId: string) {
  for (const kind of ['income', 'expense'] as const) {
    const roots = DEFAULT_CATEGORIES[kind].map((d) => ({
      userId,
      id: uuidv7(),
      kind,
      name: d.name,
    }));
    await tx.insert(categories).values(roots);
    for (const [i, d] of DEFAULT_CATEGORIES[kind].entries()) {
      const root = roots[i];
      if (root && d.children) await addChildren(tx, userId, root, [], d.children);
    }
  }
}

const childrenOf = (name: string) =>
  DEFAULT_CATEGORIES.expense.find((d) => d.name === name)?.children ?? [];

/**
 * Version 1 → 2 for users seeded before the household bills were split out. Nothing is
 * deleted and every category keeps its id, so past movements stay where they were:
 * "Servicios públicos" becomes "Servicios del hogar", an untouched "Internet y celular" moves
 * under it, and the new subcategories are added next to whatever the user already has.
 */
async function upgradeDefaultsToV2(tx: Executor, userId: string) {
  const mine = await tx
    .select()
    .from(categories)
    .where(
      ownedBy(
        categories.userId,
        userId,
        and(eq(categories.kind, 'expense'), isNull(categories.archivedAt)),
      ),
    );
  const root = (name: string) =>
    mine.find((c) => c.parentId === null && c.name.toLowerCase() === name.toLowerCase());
  const SERVICES = 'Servicios del hogar';

  let services = root(SERVICES);
  const utilities = root(V1_UTILITIES);
  if (!services && utilities) {
    await tx
      .update(categories)
      .set({ name: SERVICES })
      .where(ownedBy(categories.userId, userId, eq(categories.id, utilities.id)));
    services = { ...utilities, name: SERVICES };
  }
  if (!services) {
    const [created] = await tx
      .insert(categories)
      .values({ userId, id: uuidv7(), kind: 'expense', name: SERVICES })
      .returning();
    if (!created) throw new Error('Insert returned no row');
    services = created;
  }

  // A root with subcategories of its own can't become a subcategory (one level); leave it.
  const telecom = root(V1_TELECOM);
  const moveTelecom = telecom !== undefined && !mine.some((c) => c.parentId === telecom.id);
  if (telecom && moveTelecom) {
    await tx
      .update(categories)
      .set({ parentId: services.id })
      .where(ownedBy(categories.userId, userId, eq(categories.id, telecom.id)));
    mine.push({ ...telecom, parentId: services.id });
  }
  await addChildren(
    tx,
    userId,
    services,
    mine,
    // Its movements already mix internet and phone, so they keep their shared subcategory.
    childrenOf(SERVICES).filter((n) => !(moveTelecom && (n === 'Internet' || n === 'Celular'))),
  );

  const vivienda = root('Vivienda');
  if (vivienda) await addChildren(tx, userId, vivienda, mine, childrenOf('Vivienda'));
}

/**
 * Creates the default categories the first time and upgrades users seeded by an earlier
 * version, each exactly once: concurrent calls wait on the user's seed row, then skip.
 */
export async function ensureDefaultCategories(db: Executor, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const claimed = await tx
      .insert(seededUsers)
      .values({ userId, version: DEFAULTS_VERSION })
      .onConflictDoNothing()
      .returning({ userId: seededUsers.userId });
    if (claimed.length > 0) {
      await insertDefaults(tx, userId);
      return;
    }
    const outdated = await tx
      .update(seededUsers)
      .set({ version: DEFAULTS_VERSION })
      .where(and(eq(seededUsers.userId, userId), lt(seededUsers.version, DEFAULTS_VERSION)))
      .returning({ userId: seededUsers.userId });
    if (outdated.length > 0) await upgradeDefaultsToV2(tx, userId);
  });
}

export async function listCategories(db: Executor, userId: string): Promise<Category[]> {
  await ensureDefaultCategories(db, userId);
  return readCategories(db, userId);
}

/** The user's categories as stored, without creating the defaults: safe in read-only snapshots. */
export async function readCategories(db: Executor, userId: string): Promise<Category[]> {
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
