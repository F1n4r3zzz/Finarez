import type { Category, TransactionView } from '@finanz/contracts';

/** The kind's active categories in their usual order: each one followed by its subcategories. */
export function selectableCategories(categories: readonly Category[], kind: 'income' | 'expense') {
  const active = categories.filter((c) => c.kind === kind && !c.archived);
  return active
    .filter((c) => !c.parentId)
    .flatMap((root) => [root, ...active.filter((c) => c.parentId === root.id)]);
}

/**
 * The categories to offer as quick picks for a new movement: the most used in `history` for that
 * kind (ties by name), filled with the usual order when there isn't enough history.
 */
export function topCategories(
  history: readonly TransactionView[],
  categories: readonly Category[],
  kind: 'income' | 'expense',
  count = 6,
): Category[] {
  const selectable = selectableCategories(categories, kind);
  const allowed = new Map(selectable.map((c) => [c.id, c]));
  const uses = new Map<string, number>();
  for (const t of history) {
    if (t.kind !== kind) continue;
    for (const e of t.entries) {
      if (e.categoryId && allowed.has(e.categoryId)) {
        uses.set(e.categoryId, (uses.get(e.categoryId) ?? 0) + 1);
      }
    }
  }
  const used = [...uses]
    .sort(
      ([a, x], [b, y]) =>
        y - x || (allowed.get(a)?.name ?? '').localeCompare(allowed.get(b)?.name ?? '', 'es'),
    )
    .map(([id]) => allowed.get(id) as Category);
  const rest = selectable.filter((c) => !uses.has(c.id));
  return [...used, ...rest].slice(0, count);
}
