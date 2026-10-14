import { DomainError } from './errors';

/** Supported currencies with their ISO 4217 minor units. Never assume 2. */
const CURRENCIES = {
  USD: { minorUnits: 2 },
  EUR: { minorUnits: 2 },
  COP: { minorUnits: 2 },
  MXN: { minorUnits: 2 },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as readonly CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(CURRENCIES, value);
}

export function parseCurrencyCode(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) {
    throw new DomainError('money.unknown_currency', `Unsupported currency: ${value}`);
  }
  return value;
}

export function minorUnits(currency: CurrencyCode): number {
  return CURRENCIES[currency].minorUnits;
}
