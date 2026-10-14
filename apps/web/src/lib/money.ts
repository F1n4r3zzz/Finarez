import { formatDecimal, type Money, minorUnits } from '@finanz/kernel';
import { formattingLocale } from './locale';

export interface FormatMoneyOptions {
  locale?: string;
  /** Show the ISO code ("COP") instead of a symbol; use when several currencies appear together. */
  showCode?: boolean;
  signDisplay?: 'auto' | 'exceptZero' | 'never';
}

/** Currencies whose cents are rarely used day to day: whole amounts drop the ",00". */
const HIDE_ZERO_CENTS: ReadonlySet<string> = new Set(['COP']);

export function formatMoney(value: Money, options: FormatMoneyOptions = {}): string {
  const format = new Intl.NumberFormat(options.locale ?? formattingLocale(), {
    style: 'currency',
    currency: value.currency,
    currencyDisplay: options.showCode ? 'code' : 'symbol',
    signDisplay: options.signDisplay ?? 'auto',
    // Always all minor digits: Intl's own defaults (0 for COP) would round the amount shown.
    minimumFractionDigits: minorUnits(value.currency),
    maximumFractionDigits: minorUnits(value.currency),
    trailingZeroDisplay: HIDE_ZERO_CENTS.has(value.currency) ? 'stripIfInteger' : 'auto',
  });
  // Intl formats a decimal string exactly, so the amount never becomes a binary float.
  return format.format(formatDecimal(value) as `${number}`);
}
