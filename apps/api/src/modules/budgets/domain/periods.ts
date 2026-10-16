import { type LocalDate, parseLocalDate } from '@finanz/kernel';

export const PERIOD_KINDS = ['monthly', 'quarterly', 'yearly'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

/** A calendar month, quarter (from January, April, July or October) or year. */
export interface Period {
  from: LocalDate;
  to: LocalDate;
}

const MONTHS: Record<PeriodKind, number> = { monthly: 1, quarterly: 3, yearly: 12 };

const pad = (n: number) => String(n).padStart(2, '0');

function span(year: number, month: number, months: number): Period {
  const last = new Date(Date.UTC(year, month - 1 + months, 0)).toISOString().slice(0, 10);
  return { from: parseLocalDate(`${year}-${pad(month)}-01`), to: parseLocalDate(last) };
}

/** The period of `kind` that contains `day`. */
export function periodOf(kind: PeriodKind, day: LocalDate): Period {
  const [year, month] = day.split('-').map(Number) as [number, number];
  const size = MONTHS[kind];
  return span(year, Math.floor((month - 1) / size) * size + 1, size);
}

/** The period right after `period`. */
export function nextPeriod(kind: PeriodKind, period: Period): Period {
  const [year, month] = period.to.split('-').map(Number) as [number, number];
  return month === 12 ? span(year + 1, 1, MONTHS[kind]) : span(year, month + 1, MONTHS[kind]);
}

/** The periods from the one containing `from` through the one containing `to`, in order. */
export function periodsBetween(kind: PeriodKind, from: LocalDate, to: LocalDate): Period[] {
  const periods: Period[] = [];
  for (let p = periodOf(kind, from); p.from <= to; p = nextPeriod(kind, p)) periods.push(p);
  return periods;
}

/** A limit and the first day of the first period it applies to. */
export interface Limit {
  effectiveFrom: LocalDate;
  amountMinor: bigint;
}

/** The limit in force in `period`: the latest one starting on or before it. */
export function limitIn(limits: readonly Limit[], period: Period): bigint {
  let found: Limit | undefined;
  for (const l of limits) {
    if (l.effectiveFrom <= period.from && (!found || l.effectiveFrom > found.effectiveFrom))
      found = l;
  }
  if (!found) throw new Error(`No limit for the period starting ${period.from}`);
  return found.amountMinor;
}

export interface PeriodFigures extends Period {
  limit: bigint;
  /** From earlier periods: left over (positive) or overspent (negative). */
  carried: bigint;
  available: bigint;
  spent: bigint;
  remaining: bigint;
  overspent: boolean;
}

/**
 * Each period's figures from `periods[0]` on. With carryover, what is left of one period (or
 * overspent in it) moves into the next, so `periods` must then begin at the budget's start.
 */
export function figures(
  periods: readonly Period[],
  limits: readonly Limit[],
  carryover: boolean,
  spentIn: (period: Period) => bigint,
): PeriodFigures[] {
  let carried = 0n;
  return periods.map((period) => {
    const limit = limitIn(limits, period);
    const available = limit + carried;
    const spent = spentIn(period);
    const remaining = available - spent;
    carried = carryover ? remaining : 0n;
    return {
      ...period,
      limit,
      carried: available - limit,
      available,
      spent,
      remaining,
      overspent: spent > available,
    };
  });
}
