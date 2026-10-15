import type { CurrencyCode } from './currency';
import { minorUnits } from './currency';
import { DomainError } from './errors';
import { type Money, money } from './money';

/** Fraction digits stored rates may have (`numeric(38,18)`) and shown when a rate repeats. */
export const RATE_SCALE = 18;

/**
 * An exact positive exchange rate as a fraction: value = numerator / denominator. "1 base =
 * value quote". Inverses and paths through USD stay exact, so a conversion is rounded once,
 * at the end (ADR 0008).
 */
export interface ExactRate {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

const RATE = /^(\d{1,20})(?:\.(\d{1,18}))?$/;
const TEN = 10n;

function pow10(exponent: number): bigint {
  return TEN ** BigInt(exponent);
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/** Lowest terms, so equal rates have one representation. */
function reduce(numerator: bigint, denominator: bigint): ExactRate {
  const g = gcd(numerator, denominator);
  return Object.freeze({ numerator: numerator / g, denominator: denominator / g });
}

/** Parses "4000.5" exactly. No signs, exponents, separators or zero. */
export function parseRate(input: string): ExactRate {
  const match = RATE.exec(input);
  if (!match) throw new DomainError('rate.invalid', `Invalid exchange rate: "${input}"`);
  const [, whole = '', fraction = ''] = match;
  const numerator = BigInt(whole + fraction);
  if (numerator === 0n) throw new DomainError('rate.invalid', 'An exchange rate must be above 0');
  return reduce(numerator, pow10(fraction.length));
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

/**
 * Decimal text of a rate: exact when it terminates within 18 places, otherwise rounded to 18
 * (display only; arithmetic always uses the fraction).
 */
export function formatRate(rate: ExactRate): string {
  const scaled = divRoundHalfEven(rate.numerator * pow10(RATE_SCALE), rate.denominator);
  const digits = scaled.toString().padStart(RATE_SCALE + 1, '0');
  const whole = digits.slice(0, -RATE_SCALE);
  const fraction = digits.slice(-RATE_SCALE).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Exact product, for conversions through an intermediate currency. */
export function multiplyRates(a: ExactRate, b: ExactRate): ExactRate {
  return reduce(a.numerator * b.numerator, a.denominator * b.denominator);
}

/** Exact 1 / rate. */
export function invertRate(rate: ExactRate): ExactRate {
  return reduce(rate.denominator, rate.numerator);
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
  const numerator = amountMinor * rate.numerator * pow10(Math.max(0, toUnits - fromUnits));
  const denominator = rate.denominator * pow10(Math.max(0, fromUnits - toUnits));
  return divRoundHalfEven(numerator, denominator);
}

export function convert(amount: Money, rate: ExactRate, to: CurrencyCode): Money {
  return money(
    convertMinor(amount.amountMinor, minorUnits(amount.currency), minorUnits(to), rate),
    to,
  );
}
