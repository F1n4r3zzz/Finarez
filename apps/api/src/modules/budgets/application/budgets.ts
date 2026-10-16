import type { BudgetPeriodView, BudgetView } from '@finanz/contracts';
import {
  type CurrencyCode,
  type LocalDate,
  parseCurrencyCode,
  parseLocalDate,
} from '@finanz/kernel';
import { asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { uuidv7 } from '../../../platform/ids';
import { readCategories } from '../../categories';
import { Converter, type Excluded, loadRateBook, type RateBook } from '../../currency';
import { factsBetween, type LedgerFact } from '../../ledger';
import {
  figures,
  type Limit,
  type Period,
  type PeriodFigures,
  type PeriodKind,
  periodOf,
  periodsBetween,
} from '../domain/periods';
import { budgets, limits } from '../infra/schema';

/** An expected refusal; `code` is stable and translated by the UI. */
export class BudgetError extends Error {
  constructor(
    readonly code:
      | 'budgets.not_found'
      | 'budgets.category'
      | 'budgets.duplicate_category'
      | 'budgets.archived',
  ) {
    super(code);
    this.name = 'BudgetError';
  }
}

type BudgetRow = typeof budgets.$inferSelect;

export interface NewBudget {
  categoryId: string;
  period: PeriodKind;
  currency: CurrencyCode;
  amountMinor: bigint;
  carryover: boolean;
  /** Any day of the first period. */
  startsOn: LocalDate;
}

export async function createBudget(
  tx: Executor,
  userId: string,
  input: NewBudget,
): Promise<BudgetRow> {
  const category = (await readCategories(tx, userId)).find((c) => c.id === input.categoryId);
  if (category?.kind !== 'expense' || category.archived) throw new BudgetError('budgets.category');
  const startsOn = periodOf(input.period, input.startsOn).from;
  try {
    const [row] = await tx
      .insert(budgets)
      .values({
        userId,
        id: uuidv7(),
        categoryId: input.categoryId,
        categoryKind: 'expense',
        period: input.period,
        currency: input.currency,
        carryover: input.carryover,
        startsOn,
      })
      .returning();
    if (!row) throw new Error('Insert returned no row');
    await tx.insert(limits).values({
      userId,
      budgetId: row.id,
      effectiveFrom: startsOn,
      amountMinor: input.amountMinor,
    });
    return row;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
    const { code, constraint } = cause as { code?: string; constraint?: string };
    if (code === '23505' && constraint === 'budgets_one_per_category')
      throw new BudgetError('budgets.duplicate_category');
    throw error;
  }
}

/** Reads the budget and holds its row until the transaction ends, so changes queue up. */
async function lockBudget(tx: Executor, userId: string, id: string): Promise<BudgetRow> {
  const [row] = await tx
    .select()
    .from(budgets)
    .where(ownedBy(budgets.userId, userId, eq(budgets.id, id)))
    .for('update');
  if (!row) throw new BudgetError('budgets.not_found');
  return row;
}

export interface BudgetChange {
  amountMinor?: bigint;
  /** Any day of the first period the new limit applies to; never earlier than the start. */
  from: LocalDate;
  carryover?: boolean;
}

/**
 * A new limit applies from the period containing `from` on, replacing any later change;
 * earlier periods keep the limit they had.
 */
export async function updateBudget(
  tx: Executor,
  userId: string,
  id: string,
  change: BudgetChange,
): Promise<void> {
  const row = await lockBudget(tx, userId, id);
  if (row.archivedAt) throw new BudgetError('budgets.archived');
  if (change.amountMinor !== undefined) {
    const asked = periodOf(row.period, change.from).from;
    const start = asked < row.startsOn ? parseLocalDate(row.startsOn) : asked;
    await tx
      .delete(limits)
      .where(
        ownedBy(limits.userId, userId, eq(limits.budgetId, id), gte(limits.effectiveFrom, start)),
      );
    await tx
      .insert(limits)
      .values({ userId, budgetId: id, effectiveFrom: start, amountMinor: change.amountMinor });
  }
  await tx
    .update(budgets)
    .set({
      ...(change.carryover === undefined ? {} : { carryover: change.carryover }),
      updatedAt: new Date(),
    })
    .where(ownedBy(budgets.userId, userId, eq(budgets.id, id)));
}

export async function archiveBudget(tx: Executor, userId: string, id: string): Promise<void> {
  const row = await lockBudget(tx, userId, id);
  if (row.archivedAt) return;
  await tx
    .update(budgets)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(ownedBy(budgets.userId, userId, eq(budgets.id, id)));
}

async function limitsOf(tx: Executor, userId: string, ids: string[]) {
  const rows = await tx
    .select()
    .from(limits)
    .where(ownedBy(limits.userId, userId, inArray(limits.budgetId, ids)))
    .orderBy(asc(limits.effectiveFrom));
  const byBudget = new Map<string, Limit[]>();
  for (const r of rows) {
    const list = byBudget.get(r.budgetId) ?? [];
    list.push({ effectiveFrom: parseLocalDate(r.effectiveFrom), amountMinor: r.amountMinor });
    byBudget.set(r.budgetId, list);
  }
  return byBudget;
}

/** Expense entries by category, the rates, and each category with its subcategories. */
interface Spending {
  byCategory: Map<string, LedgerFact[]>;
  book: RateBook;
  tree: Map<string, string[]>;
}

async function spending(
  tx: Executor,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<Spending> {
  const byCategory = new Map<string, LedgerFact[]>();
  for (const f of await factsBetween(tx, userId, from, to)) {
    if (f.accountKind !== 'expense' || !f.categoryId) continue;
    const list = byCategory.get(f.categoryId) ?? [];
    list.push(f);
    byCategory.set(f.categoryId, list);
  }
  // The current tree: a subcategory moved to another parent counts there for every period.
  const tree = new Map<string, string[]>();
  for (const c of await readCategories(tx, userId)) {
    if (!tree.has(c.id)) tree.set(c.id, [c.id]);
    if (c.parentId) tree.set(c.parentId, [...(tree.get(c.parentId) ?? [c.parentId]), c.id]);
  }
  return { byCategory, book: await loadRateBook(tx, userId), tree };
}

interface Walked extends PeriodFigures {
  /** Left out for lack of a rate: this period's, plus earlier ones' when they carry over. */
  excluded: Excluded[];
}

/** Each period's figures for one budget, converting every expense at its own date's rate. */
function walk(row: BudgetRow, budgetLimits: Limit[], periods: Period[], s: Spending): Walked[] {
  const currency = parseCurrencyCode(row.currency);
  const facts = (s.tree.get(row.categoryId) ?? [row.categoryId]).flatMap(
    (id) => s.byCategory.get(id) ?? [],
  );
  const missing: Excluded[][] = [];
  const rows = figures(periods, budgetLimits, row.carryover, (period) => {
    const converter = new Converter(s.book, currency);
    let total = 0n;
    for (const f of facts) {
      if (f.occurredOn < period.from || f.occurredOn > period.to) continue;
      total += converter.convert(
        f.amountMinor,
        f.currency,
        f.occurredOn,
        `expense:${f.categoryId}`,
      );
    }
    missing.push(converter.excluded);
    return total;
  });
  return rows.map((r, i) => ({
    ...r,
    excluded: row.carryover ? missing.slice(0, i + 1).flat() : (missing[i] ?? []),
  }));
}

const periodView = (w: Walked): BudgetPeriodView => ({
  from: w.from,
  to: w.to,
  limitMinor: w.limit.toString(),
  carriedMinor: w.carried.toString(),
  availableMinor: w.available.toString(),
  spentMinor: w.spent.toString(),
  remainingMinor: w.remaining.toString(),
  overspent: w.overspent,
  excluded: w.excluded.map((e) => ({ ...e, amountMinor: e.amountMinor.toString() })),
});

/** The periods to walk to reach `target`: from the start with carryover, else just it. */
function walkFrom(row: BudgetRow, target: Period): LocalDate {
  return row.carryover ? parseLocalDate(row.startsOn) : target.from;
}

/**
 * The user's active budgets (or the one with `id`, archived or not), each with its figures for
 * the period containing `on`.
 */
export async function budgetViews(
  tx: Executor,
  userId: string,
  on: LocalDate,
  id?: string,
): Promise<BudgetView[]> {
  const rows = await tx
    .select()
    .from(budgets)
    .where(ownedBy(budgets.userId, userId, id ? eq(budgets.id, id) : isNull(budgets.archivedAt)))
    .orderBy(asc(budgets.createdAt));
  if (rows.length === 0) return [];
  const budgetLimits = await limitsOf(
    tx,
    userId,
    rows.map((r) => r.id),
  );
  const targets = rows.map((r) => periodOf(r.period, on));
  // One read of the expenses covers every budget that has started by then.
  let from: LocalDate | undefined;
  let to: LocalDate | undefined;
  rows.forEach((row, i) => {
    const target = targets[i] as Period;
    if (target.from < row.startsOn) return;
    const start = walkFrom(row, target);
    if (!from || start < from) from = start;
    if (!to || target.to > to) to = target.to;
  });
  const s = from && to ? await spending(tx, userId, from, to) : undefined;

  return rows.map((row, i) => {
    const target = targets[i] as Period;
    const own = budgetLimits.get(row.id) ?? [];
    const current =
      !s || target.from < row.startsOn
        ? undefined
        : walk(row, own, periodsBetween(row.period, walkFrom(row, target), target.to), s).at(-1);
    return {
      id: row.id,
      categoryId: row.categoryId,
      period: row.period,
      currency: parseCurrencyCode(row.currency),
      carryover: row.carryover,
      startsOn: parseLocalDate(row.startsOn),
      archived: row.archivedAt !== null,
      limitMinor: (current?.limit ?? own[0]?.amountMinor ?? 0n).toString(),
      current: current ? periodView(current) : null,
    };
  });
}

/** Up to `count` periods of one budget, oldest first, ending with the one containing `to`. */
export async function budgetHistory(
  tx: Executor,
  userId: string,
  id: string,
  to: LocalDate,
  count: number,
): Promise<BudgetPeriodView[]> {
  const [row] = await tx
    .select()
    .from(budgets)
    .where(ownedBy(budgets.userId, userId, eq(budgets.id, id)));
  if (!row) throw new BudgetError('budgets.not_found');
  const target = periodOf(row.period, to);
  if (target.from < row.startsOn) return [];
  // Every period since the start; carryover needs them all, otherwise the last `count` do.
  const periods = periodsBetween(row.period, parseLocalDate(row.startsOn), target.to);
  const shown = row.carryover ? periods : periods.slice(Math.max(0, periods.length - count));
  const own = (await limitsOf(tx, userId, [id])).get(id) ?? [];
  const s = await spending(tx, userId, (shown[0] as Period).from, target.to);
  return walk(row, own, shown, s)
    .slice(Math.max(0, shown.length - count))
    .map(periodView);
}
