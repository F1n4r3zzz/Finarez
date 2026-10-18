import type { DebtView, OccurrenceView, RuleView } from '@finanz/contracts';
import {
  type CurrencyCode,
  type LocalDate,
  type Money,
  money,
  parseLocalDate,
} from '@finanz/kernel';

export interface MonthFigures {
  /** Money left over, spent beyond what came in, or nothing happened yet. */
  state: 'left' | 'over' | 'empty';
  /** Share of the income spent, from 0 to 1 (1 when over). */
  spentShare: number;
  /** Income minus spending; negative when over. */
  remaining: bigint;
}

/** The month's ring and chip, safe when nothing came in. Amounts are positive minor units. */
export function monthFigures(income: bigint, expenses: bigint): MonthFigures {
  const remaining = income - expenses;
  if (income === 0n && expenses === 0n) return { state: 'empty', spentShare: 0, remaining };
  if (expenses > income) return { state: 'over', spentShare: 1, remaining };
  return { state: 'left', spentShare: Number(expenses) / Number(income), remaining };
}

const iso = (date: Date) => parseLocalDate(date.toISOString().slice(0, 10));

/** Last month from its first day to today's day number (its last day when it is shorter). */
export function samePointLastMonth(today: LocalDate): { from: LocalDate; to: LocalDate } {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  return {
    from: iso(new Date(Date.UTC(y, m - 2, 1))),
    to: iso(new Date(Date.UTC(y, m - 2, Math.min(d, lastDay)))),
  };
}

export interface UpcomingItem {
  key: string;
  date: LocalDate;
  title: string;
  amount: Money | null;
  /** Waiting for the user's OK, a recurring movement coming up, or a debt payment due. */
  kind: 'confirm' | 'recurring' | 'debt';
  ruleId?: string;
}

const HORIZON_DAYS = 14;
const MAX_ITEMS = 3;

const amountOf = (minor: string | null, currency: CurrencyCode) =>
  minor === null ? null : money(BigInt(minor), currency);

/** What Inicio lists under "Próximos": pending confirmations first, then the next 14 days. */
export function upcomingItems(input: {
  pending: readonly OccurrenceView[];
  rules: readonly RuleView[];
  debts: readonly DebtView[];
  today: LocalDate;
}): UpcomingItem[] {
  const { today } = input;
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const horizon = iso(new Date(Date.UTC(y, m - 1, d + HORIZON_DAYS)));
  const soon = (date: LocalDate) => date >= today && date <= horizon;

  const confirm: UpcomingItem[] = input.pending
    .filter((o) => o.status === 'pending')
    .map((o) => ({
      key: `confirm-${o.ruleId}-${o.dueOn}`,
      date: o.dueOn,
      title: o.description,
      amount: amountOf(o.amountMinor, o.currency),
      kind: 'confirm',
      ruleId: o.ruleId,
    }));
  // A rule already waiting for the user shows once, as the thing to confirm.
  const waiting = new Set(confirm.map((c) => c.ruleId));
  const coming: UpcomingItem[] = [
    ...input.rules
      .filter((r) => !r.ended && !waiting.has(r.id) && soon(r.nextDueOn))
      .map((r) => ({
        key: `rule-${r.id}`,
        date: r.nextDueOn,
        title: r.template.description,
        amount: amountOf(r.amountMinor, r.currency),
        kind: 'recurring' as const,
        ruleId: r.id,
      })),
    ...input.debts
      .filter((debt) => !debt.archived && debt.nextDueOn !== null && soon(debt.nextDueOn))
      .map((debt) => ({
        key: `debt-${debt.id}`,
        date: debt.nextDueOn as LocalDate,
        title: debt.name,
        amount: amountOf(debt.installmentMinor, debt.currency),
        kind: 'debt' as const,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return [...confirm, ...coming].slice(0, MAX_ITEMS);
}
