import { type CurrencyCode, minorUnits, parseCurrencyCode } from './currency';
import { DomainError } from './errors';

/** PostgreSQL BIGINT bounds: every amount must fit the column it is stored in. */
export const MAX_MINOR = 9_223_372_036_854_775_807n;
export const MIN_MINOR = -9_223_372_036_854_775_808n;

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
}

/** JSON shape of an amount: minor units as a decimal string, never a JSON number. */
export interface MoneyWire {
  amountMinor: string;
  currency: string;
}

export function money(amountMinor: bigint, currency: CurrencyCode): Money {
  if (amountMinor > MAX_MINOR || amountMinor < MIN_MINOR) {
    throw new DomainError('money.out_of_range', `Amount ${amountMinor} exceeds BIGINT range`);
  }
  return Object.freeze({ amountMinor, currency });
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainError(
      'money.currency_mismatch',
      `Cannot combine ${a.currency} and ${b.currency}`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.amountMinor, a.currency);
}

export function sum(currency: CurrencyCode, items: readonly Money[]): Money {
  return items.reduce(add, money(0n, currency));
}

export function isZero(a: Money): boolean {
  return a.amountMinor === 0n;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor === b.amountMinor) return 0;
  return a.amountMinor < b.amountMinor ? -1 : 1;
}

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Parses a canonical decimal string ("1234.5", "-0.01") exactly. Thousands separators and
 * locale formats are rejected here; normalize them first. Never rounds: more fraction digits
 * than the currency allows is an error.
 */
export function parseDecimal(input: string, currency: CurrencyCode): Money {
  const match = DECIMAL.exec(input);
  const units = minorUnits(currency);
  const [, sign, whole = '', fraction = ''] = match ?? [];
  if (!match || fraction.length > units) {
    throw new DomainError('money.invalid_amount', `Invalid ${currency} amount: "${input}"`);
  }
  const minor = BigInt(whole + fraction.padEnd(units, '0'));
  return money(sign ? -minor : minor, currency);
}

/** Canonical decimal string with exactly the currency's minor digits ("-0.05", "12.00"). */
export function formatDecimal(a: Money): string {
  const units = minorUnits(a.currency);
  const negative = a.amountMinor < 0n;
  const digits = (negative ? -a.amountMinor : a.amountMinor).toString().padStart(units + 1, '0');
  const whole = digits.slice(0, digits.length - units);
  const fraction = units > 0 ? `.${digits.slice(digits.length - units)}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

const MINOR_STRING = /^-?(0|[1-9]\d*)$/;

export function toWire(a: Money): MoneyWire {
  return { amountMinor: a.amountMinor.toString(), currency: a.currency };
}

export function fromWire(wire: MoneyWire): Money {
  if (!MINOR_STRING.test(wire.amountMinor) || wire.amountMinor === '-0') {
    throw new DomainError(
      'money.invalid_amount',
      `Invalid minor-unit string: "${wire.amountMinor}"`,
    );
  }
  return money(BigInt(wire.amountMinor), parseCurrencyCode(wire.currency));
}
