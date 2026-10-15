import {
  type CurrencyCode,
  DomainError,
  formatDecimal,
  type Money,
  minorUnits,
  parseDecimal,
} from '@finanz/kernel';

/** The decimal mark of this locale: "," in es-CO, "." in es-MX and en-US. */
export function decimalSeparator(locale: string): ',' | '.' {
  const parts = new Intl.NumberFormat(locale).formatToParts(1.5);
  return parts.find((p) => p.type === 'decimal')?.value === ',' ? ',' : '.';
}

/**
 * Reads an amount as typed ("50.000", "1.234,56", "$ 3.400", "1,234.56") into exact minor
 * units, never through a float. Thousands separators are dropped; the locale decides which
 * mark is the decimal one. A lone separator followed by exactly three digits ("50.000") is
 * read as thousands, which is how amounts are written in Colombia.
 */
export function parseAmountInput(text: string, currency: CurrencyCode, locale: string): Money {
  const cleaned = text.replace(/[\s$€]|COP|USD|EUR|MXN/gi, '').replace(/^\+/, '');
  if (!/^-?[\d.,]+$/.test(cleaned)) {
    throw new DomainError('money.invalid_amount', `Invalid amount: "${text}"`);
  }
  const negative = cleaned.startsWith('-');
  const digits = negative ? cleaned.slice(1) : cleaned;
  const decimal = decimalSeparator(locale);
  const thousands = decimal === ',' ? '.' : ',';
  let normalized = digits.split(thousands).join('');
  const pieces = normalized.split(decimal);
  if (pieces.length > 2) throw new DomainError('money.invalid_amount', `Invalid amount: "${text}"`);
  // "50,000" in a comma-decimal locale is still fifty thousand: three digits after one comma,
  // after a whole part that could start a thousands group (not "0,001").
  const [whole = '', fraction = ''] = pieces;
  if (
    pieces.length === 2 &&
    fraction.length === 3 &&
    !digits.includes(thousands) &&
    !whole.startsWith('0')
  ) {
    normalized = pieces.join('');
  } else {
    normalized = pieces.join('.');
  }
  return parseDecimal(`${negative ? '-' : ''}${normalized}`, currency);
}

/** Shows an amount the way people type it in this locale ("310.000", "25,50"), for editing. */
export function formatAmountInput(value: Money, locale: string): string {
  const units = minorUnits(value.currency);
  const wholeOnly = value.amountMinor % 10n ** BigInt(units) === 0n;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: wholeOnly ? 0 : units,
    maximumFractionDigits: units,
  }).format(formatDecimal(value) as `${number}`);
}

/**
 * Reads an exchange rate as typed in this locale ("4.010,5" in es-CO, "4,010.5" in en-US) into
 * the API's canonical decimal ("4010.5"); undefined if it isn't a positive number.
 */
export function parseRateInput(text: string, locale: string): string | undefined {
  const decimal = decimalSeparator(locale);
  const thousands = decimal === ',' ? '.' : ',';
  const normalized = text.trim().replace(/\s/g, '').split(thousands).join('').replace(decimal, '.');
  return /^\d{1,20}(\.\d{1,18})?$/.test(normalized) && /[1-9]/.test(normalized)
    ? normalized
    : undefined;
}

/** "1,2" (percent, as typed) → "0.012" (the fraction the API stores), exactly. */
export function percentToFraction(text: string, locale: string): string | undefined {
  const value = text.trim() === '0' ? '0' : parseRateInput(text, locale);
  if (value === undefined) return undefined;
  // Dividing by 100 moves the decimal point two places left.
  const [whole = '0', fraction = ''] = value.split('.');
  const digits = whole.padStart(3, '0') + fraction;
  const point = digits.length - fraction.length - 2;
  const result = `${digits.slice(0, point).replace(/^0+(?=\d)/, '')}.${digits.slice(point)}`;
  return result.replace(/\.?0+$/, '') || '0';
}

/** "0.012" (the fraction the API stores) → "1,2" in this locale, exactly. */
export function fractionToPercent(fraction: string, locale: string): string {
  const [whole = '0', part = ''] = fraction.split('.');
  // Multiplying by 100 moves the decimal point two places right.
  const digits = whole + part.padEnd(2, '0');
  const point = whole.length + 2;
  const value = `${digits.slice(0, point)}.${digits.slice(point)}`
    .replace(/^0+(?=\d)/, '')
    .replace(/\.?0*$/, '');
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value as `${number}`);
}
