import type { CurrencyCode, LocalDate } from '@finanz/kernel';

/**
 * Months left to save, counting the current month and the target's month: from 15 October to
 * 31 December is October, November and December. A date already past leaves one month, so
 * whatever is missing is due now.
 */
export function monthsLeft(today: LocalDate, targetDate: LocalDate): number {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const [ty, tm] = targetDate.split('-').map(Number) as [number, number];
  return Math.max(1, (ty - y) * 12 + (tm - m) + 1);
}

/** The smallest amount people use in a currency day to day, in minor units (COP: whole pesos). */
export const savingUnit = (currency: CurrencyCode): bigint => (currency === 'COP' ? 100n : 1n);

/**
 * The same amount saved every month that reaches the target by its date, rounded up to `unit`
 * so following it never falls short. Zero once the target is met.
 */
export function monthlyNeeded(
  targetMinor: bigint,
  savedMinor: bigint,
  months: number,
  unit: bigint,
): bigint {
  const missing = targetMinor - savedMinor;
  if (missing <= 0n) return 0n;
  const step = BigInt(months) * unit;
  return ((missing + step - 1n) / step) * unit;
}
