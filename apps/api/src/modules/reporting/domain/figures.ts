import type { LocalDate } from '@finanz/kernel';
import type { Converter } from '../../currency';
import type { AccountBalance, LedgerFact } from '../../ledger';

export interface CategoryTotal {
  categoryId: string;
  amountMinor: bigint;
}

export interface Summary {
  income: bigint;
  expenses: bigint;
  net: bigint;
  incomeByCategory: CategoryTotal[];
  expensesByCategory: CategoryTotal[];
}

const byAmount = (totals: Map<string, bigint>): CategoryTotal[] =>
  [...totals]
    .map(([categoryId, amountMinor]) => ({ categoryId, amountMinor }))
    .sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : b.amountMinor < a.amountMinor ? -1 : 0));

/**
 * Income and expenses come from entries on income and expense accounts only (CP1 #3), so
 * transfers, card payments, loan principal and investments never count. Refunds reduce the
 * category they belong to.
 */
export function summarize(facts: readonly LedgerFact[], converter: Converter): Summary {
  const income = new Map<string, bigint>();
  const expenses = new Map<string, bigint>();
  for (const f of facts) {
    if (f.accountKind !== 'income' && f.accountKind !== 'expense') continue;
    const category = f.categoryId ?? 'none';
    const value = converter.convert(
      f.amountMinor,
      f.currency,
      f.occurredOn,
      `${f.accountKind}:${category}`,
    );
    if (f.accountKind === 'income') income.set(category, (income.get(category) ?? 0n) - value);
    else expenses.set(category, (expenses.get(category) ?? 0n) + value);
  }
  const sum = (m: Map<string, bigint>) => [...m.values()].reduce((a, b) => a + b, 0n);
  const totalIncome = sum(income);
  const totalExpenses = sum(expenses);
  return {
    income: totalIncome,
    expenses: totalExpenses,
    net: totalIncome - totalExpenses,
    incomeByCategory: byAmount(income),
    expensesByCategory: byAmount(expenses),
  };
}

export interface MonthSummary extends Summary {
  /** "2026-03". */
  month: string;
  from: LocalDate;
  to: LocalDate;
}

/** Each calendar month that [from, to] touches, clipped to the range. */
export function monthsBetween(from: LocalDate, to: LocalDate) {
  const months: { month: string; from: LocalDate; to: LocalDate }[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); ) {
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) as LocalDate;
    months.push({
      month,
      from: month === from.slice(0, 7) ? from : (`${month}-01` as LocalDate),
      to: last < to ? last : to,
    });
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
    month = `${y}-${String(m).padStart(2, '0')}`;
  }
  return months;
}

/**
 * One summary per calendar month of [from, to], months without movements included. Each
 * fact is converted exactly as in `summarize`, so the months always add up to the summary of
 * the whole range.
 */
export function summarizeByMonth(
  facts: readonly LedgerFact[],
  converter: Converter,
  from: LocalDate,
  to: LocalDate,
): MonthSummary[] {
  const byMonth = new Map<string, LedgerFact[]>();
  for (const f of facts) {
    const key = f.occurredOn.slice(0, 7);
    const list = byMonth.get(key);
    if (list) list.push(f);
    else byMonth.set(key, [f]);
  }
  return monthsBetween(from, to).map((range) => ({
    ...range,
    ...summarize(byMonth.get(range.month) ?? [], converter),
  }));
}

export interface NetWorth {
  total: bigint;
  assets: bigint;
  liabilities: bigint;
  byAccount: { accountId: string; valueMinor: bigint }[];
}

/** Assets plus (negative) liabilities, each account converted at the day's rate. */
export function netWorth(
  balances: readonly AccountBalance[],
  on: LocalDate,
  converter: Converter,
): NetWorth {
  let assets = 0n;
  let liabilities = 0n;
  const byAccount = balances.map((b) => {
    const valueMinor =
      b.balanceMinor === 0n
        ? 0n
        : converter.convert(b.balanceMinor, b.currency, on, `balance:${b.accountId}`);
    if (b.kind === 'asset') assets += valueMinor;
    else liabilities += valueMinor;
    return { accountId: b.accountId, valueMinor };
  });
  return { total: assets + liabilities, assets, liabilities, byAccount };
}

export interface Bridge {
  start: bigint;
  end: bigint;
  net: bigint;
  valuation: bigint;
  openingContributions: bigint;
  realizedFx: bigint;
  unrealizedFx: bigint;
  rounding: bigint;
}

/**
 * Explains the change in net worth over a period (data-model §9). Every entry is converted
 * once by the same rule, so the parts add up to the change exactly, in minor units:
 * end − start = net + valuation + opening contributions + realized FX + unrealized FX + rounding.
 */
export function bridge(input: {
  facts: readonly LedgerFact[];
  startBalances: readonly AccountBalance[];
  endBalances: readonly AccountBalance[];
  startDate: LocalDate;
  endDate: LocalDate;
  converter: Converter;
}): Bridge {
  const { facts, converter } = input;
  const start = netWorth(input.startBalances, input.startDate, converter);
  const end = netWorth(input.endBalances, input.endDate, converter);

  let income = 0n;
  let expenses = 0n;
  let valuation = 0n;
  let opening = 0n;
  let realizedFx = 0n;
  let rounding = 0n;
  const flowsByAccount = new Map<string, bigint>();
  for (const f of facts) {
    const value = converter.convert(
      f.amountMinor,
      f.currency,
      f.occurredOn,
      `flow:${f.accountKind}`,
    );
    rounding += value;
    if (f.accountKind === 'income') income -= value;
    else if (f.accountKind === 'expense') expenses += value;
    else if (f.systemRole === 'valuation') valuation -= value;
    else if (f.systemRole === 'opening_balance') opening -= value;
    else if (f.accountKind === 'clearing') realizedFx -= value;
    else flowsByAccount.set(f.accountId, (flowsByAccount.get(f.accountId) ?? 0n) + value);
  }

  const startValue = new Map(start.byAccount.map((a) => [a.accountId, a.valueMinor]));
  let unrealizedFx = 0n;
  for (const a of end.byAccount) {
    unrealizedFx +=
      a.valueMinor - (startValue.get(a.accountId) ?? 0n) - (flowsByAccount.get(a.accountId) ?? 0n);
  }
  return {
    start: start.total,
    end: end.total,
    net: income - expenses,
    valuation,
    openingContributions: opening,
    realizedFx,
    unrealizedFx,
    rounding,
  };
}
