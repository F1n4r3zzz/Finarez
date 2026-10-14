import type { Money } from '@finanz/kernel';
import { formattingLocale } from './locale';

const abs = (n: bigint) => (n < 0n ? -n : n);

/**
 * Change in size between two amounts of the same currency, as a ratio (0.12 = 12 % larger).
 * Compares magnitudes, so for spending (negative amounts) a positive ratio means more spent.
 * Computed in integers; only the final ratio, which is not money, becomes a float.
 */
export function changeRatio(current: Money, previous: Money): number | undefined {
  const base = abs(previous.amountMinor);
  if (base === 0n || current.currency !== previous.currency) return undefined;
  const basisPoints = ((abs(current.amountMinor) - base) * 10_000n) / base;
  return Number(basisPoints) / 10_000;
}

export function formatPercent(
  ratio: number,
  { locale = formattingLocale(), signed = true }: { locale?: string; signed?: boolean } = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    signDisplay: signed ? 'exceptZero' : 'auto',
    maximumFractionDigits: 0,
  }).format(ratio);
}
