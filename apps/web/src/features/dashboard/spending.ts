import type { Category, SummaryReport } from '@finanz/contracts';
import { type LocalDate, parseLocalDate } from '@finanz/kernel';

export const SPENDING_PERIODS = ['today', 'week', 'fortnight', 'month', 'custom'] as const;
export type SpendingPeriod = (typeof SPENDING_PERIODS)[number];

const parts = (date: LocalDate) => date.split('-').map(Number) as [number, number, number];
const iso = (y: number, m: number, d: number) =>
  parseLocalDate(new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10));
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * The days each preset covers: today; this week from Monday; this fortnight (1–15 or 16 to the
 * month's end, as paydays run in Colombia); this month.
 */
export function spendingRange(
  period: Exclude<SpendingPeriod, 'custom'>,
  today: LocalDate,
): { from: LocalDate; to: LocalDate } {
  const [y, m, d] = parts(today);
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const sinceMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
      return { from: iso(y, m, d - sinceMonday), to: today };
    }
    case 'fortnight':
      return d <= 15
        ? { from: iso(y, m, 1), to: iso(y, m, 15) }
        : { from: iso(y, m, 16), to: iso(y, m, lastDay(y, m)) };
    case 'month':
      return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
  }
}

export interface Slice {
  /** A top-level category id, or `other` for the rest together. */
  key: string;
  name: string;
  amount: bigint;
  /** How many categories `other` stands for. */
  count?: number;
}

/**
 * Spending per top-level category (subcategories roll up into their parent), largest first:
 * the first `max` on their own and the rest as one `other` slice, so the ring never has more
 * than `max + 1` pieces.
 */
export function spendingSlices(
  expenses: SummaryReport['expensesByCategory'],
  categories: readonly Category[],
  max = 5,
): { slices: Slice[]; total: bigint } {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const roots = new Map<string, bigint>();
  for (const line of expenses) {
    const root = byId.get(line.categoryId)?.parentId ?? line.categoryId;
    roots.set(root, (roots.get(root) ?? 0n) + BigInt(line.amountMinor));
  }
  const ranked = [...roots]
    .filter(([, amount]) => amount > 0n)
    .sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
    .map(([id, amount]) => ({ key: id, name: byId.get(id)?.name ?? '', amount }));
  const total = ranked.reduce((sum, s) => sum + s.amount, 0n);
  if (ranked.length <= max) return { slices: ranked, total };
  const rest = ranked.slice(max);
  return {
    slices: [
      ...ranked.slice(0, max),
      {
        key: 'other',
        name: '',
        amount: rest.reduce((sum, s) => sum + s.amount, 0n),
        count: rest.length,
      },
    ],
    total,
  };
}
