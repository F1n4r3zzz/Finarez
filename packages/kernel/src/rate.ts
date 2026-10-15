import type { CurrencyCode } from './currency';
import { minorUnits } from './currency';
import { DomainError } from './errors';
import { type Money, money } from './money';

/** Fraction digits kept for stored rates and computed inverses (`numeric(38,18)`). */
export const RATE_SCALE = 18;

/**
 * An exact positive exchange rate: value = coefficient / 10^scale. "1 base = value quote".
 * Never a float, so conversions are reproducible to the last digit.
 */
export interface ExactRate {
  readonly coefficient: bigint;
  readonly scale: number;
}

const RATE = /^(\d{1,20})(?:\.(\d{1,18}))?$/;
const TEN = 10n;

function pow10(exponent: number): bigint {
  return TEN ** BigInt(exponent);
}

/** Drops trailing zeros so equal rates have one representation. */
function normalize(coefficient: bigint, scale: number): ExactRate {
  let c = coefficient;
  let s = scale;
  while (s > 0 && c % TEN === 0n) {
    c /= TEN;
    s -= 1;
  }
  return Object.freeze({ coefficient: c, scale: s });
}

/** Parses "4000.5" exactly. No signs, exponents, separators or zero. */
export function parseRate(input: string): ExactRate {
  const match = RATE.exec(input);
  if (!match) throw new DomainError('rate.invalid', `Invalid exchange rate: "${input}"`);
  const [, whole = '', fraction = ''] = match;
  const coefficient = BigInt(whole + fraction);
  if (coefficient === 0n) throw new DomainError('rate.invalid', 'An exchange rate must be above 0');
  return normalize(coefficient, fraction.length);
}

export function formatRate(rate: ExactRate): string {
  const digits = rate.coefficient.toString().padStart(rate.scale + 1, '0');
  if (rate.scale === 0) return digits;
  return `${digits.slice(0, -rate.scale)}.${digits.slice(-rate.scale)}`;
}

/** n / d rounded to the nearest integer, ties to even (d must be positive). */
export function divRoundHalfEven(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const twice = 2n * (r < 0n ? -r : r);
  const away = q + (n < 0n ? -1n : 1n);
  if (twice > d) return away;
  if (twice < d) return q;
  return q % 2n === 0n ? q : away;
}

/** Exact product, for conversions through an intermediate currency. */
export function multiplyRates(a: ExactRate, b: ExactRate): ExactRate {
  return normalize(a.coefficient * b.coefficient, a.scale + b.scale);
}

/** 1 / rate, kept at 18 decimal places (half to even). */
export function invertRate(rate: ExactRate): ExactRate {
  const coefficient = divRoundHalfEven(pow10(rate.scale + RATE_SCALE), rate.coefficient);
  if (coefficient === 0n) {
    throw new DomainError('rate.invalid', 'The inverse of this rate is below 18 decimal places');
  }
  return normalize(coefficient, RATE_SCALE);
}

/**
 * Converts an amount in minor units between currencies with the given minor-unit counts:
 * amount × 10^(toUnits − fromUnits) × rate, rounded once, half to even. Taking unit counts
 * (not currency codes) lets tests cover 0- and 3-decimal currencies.
 */
export function convertMinor(
  amountMinor: bigint,
  fromUnits: number,
  toUnits: number,
  rate: ExactRate,
): bigint {
  const numerator = amountMinor * rate.coefficient * pow10(Math.max(0, toUnits - fromUnits));
  const denominator = pow10(rate.scale + Math.max(0, fromUnits - toUnits));
  return divRoundHalfEven(numerator, denominator);
}

export function convert(amount: Money, rate: ExactRate, to: CurrencyCode): Money {
  return money(
    convertMinor(amount.amountMinor, minorUnits(amount.currency), minorUnits(to), rate),
    to,
  );
}
