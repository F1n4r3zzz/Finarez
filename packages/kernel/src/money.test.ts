import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES, type CurrencyCode } from './currency';
import { DomainError } from './errors';
import {
  add,
  compare,
  equals,
  formatDecimal,
  fromWire,
  MAX_MINOR,
  MIN_MINOR,
  money,
  negate,
  parseDecimal,
  subtract,
  sum,
  toWire,
} from './money';

const currency = fc.constantFrom(...CURRENCY_CODES);
// Halved range so sums of two amounts stay within BIGINT.
const amount = fc.bigInt({ min: MIN_MINOR / 2n, max: MAX_MINOR / 2n });
const moneyIn = (c: CurrencyCode) => amount.map((a) => money(a, c));

function expectDomainError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`expected DomainError ${code}`);
}

describe('Money arithmetic', () => {
  it('add is commutative and subtract undoes add', () => {
    fc.assert(
      fc.property(currency, amount, amount, (c, x, y) => {
        const a = money(x, c);
        const b = money(y, c);
        expect(equals(add(a, b), add(b, a))).toBe(true);
        expect(equals(subtract(add(a, b), b), a)).toBe(true);
      }),
    );
  });

  it('negate twice is identity and a + (-a) is zero', () => {
    fc.assert(
      fc.property(
        currency.chain((c) => moneyIn(c)),
        (a) => {
          expect(equals(negate(negate(a)), a)).toBe(true);
          expect(add(a, negate(a)).amountMinor).toBe(0n);
        },
      ),
    );
  });

  it('sum of an empty list is zero in the given currency', () => {
    expect(sum('COP', [])).toEqual(money(0n, 'COP'));
  });

  it('refuses to mix currencies', () => {
    const usd = money(100n, 'USD');
    const cop = money(100n, 'COP');
    expectDomainError(() => add(usd, cop), 'money.currency_mismatch');
    expectDomainError(() => subtract(usd, cop), 'money.currency_mismatch');
    expectDomainError(() => compare(usd, cop), 'money.currency_mismatch');
    expect(equals(usd, cop)).toBe(false);
  });

  it('enforces the PostgreSQL BIGINT range, including on overflow', () => {
    expect(money(MAX_MINOR, 'USD').amountMinor).toBe(MAX_MINOR);
    expect(money(MIN_MINOR, 'USD').amountMinor).toBe(MIN_MINOR);
    expectDomainError(() => money(MAX_MINOR + 1n, 'USD'), 'money.out_of_range');
    expectDomainError(() => money(MIN_MINOR - 1n, 'USD'), 'money.out_of_range');
    expectDomainError(() => add(money(MAX_MINOR, 'USD'), money(1n, 'USD')), 'money.out_of_range');
    expectDomainError(() => negate(money(MIN_MINOR, 'USD')), 'money.out_of_range');
  });

  it('compare orders amounts', () => {
    expect(compare(money(-1n, 'EUR'), money(1n, 'EUR'))).toBe(-1);
    expect(compare(money(5n, 'EUR'), money(5n, 'EUR'))).toBe(0);
    expect(compare(money(9n, 'EUR'), money(1n, 'EUR'))).toBe(1);
  });
});

describe('Decimal strings', () => {
  it('parses exactly without floating point', () => {
    expect(parseDecimal('0.1', 'USD').amountMinor).toBe(10n);
    expect(parseDecimal('0.2', 'USD').amountMinor).toBe(20n);
    expect(parseDecimal('1234567.89', 'COP').amountMinor).toBe(123456789n);
    expect(parseDecimal('-0.05', 'MXN').amountMinor).toBe(-5n);
    expect(parseDecimal('12', 'EUR').amountMinor).toBe(1200n);
    expect(parseDecimal('92233720368547758.07', 'USD').amountMinor).toBe(MAX_MINOR);
  });

  it('rejects ambiguous, localized, rounded or malformed input', () => {
    for (const bad of [
      '',
      ' 1',
      '1 ',
      '1.234',
      '1,50',
      '1.000,50',
      '1e3',
      '.5',
      '5.',
      '+5',
      'NaN',
      '--1',
    ]) {
      expectDomainError(() => parseDecimal(bad, 'USD'), 'money.invalid_amount');
    }
    expectDomainError(() => parseDecimal('92233720368547758.08', 'USD'), 'money.out_of_range');
  });

  it('formats with exactly the currency minor digits', () => {
    expect(formatDecimal(money(5n, 'USD'))).toBe('0.05');
    expect(formatDecimal(money(-5n, 'USD'))).toBe('-0.05');
    expect(formatDecimal(money(1200n, 'COP'))).toBe('12.00');
    expect(formatDecimal(money(0n, 'MXN'))).toBe('0.00');
  });

  it('round-trips format → parse for any amount', () => {
    fc.assert(
      fc.property(currency, fc.bigInt({ min: MIN_MINOR, max: MAX_MINOR }), (c, x) => {
        const a = money(x, c);
        expect(equals(parseDecimal(formatDecimal(a), c), a)).toBe(true);
      }),
    );
  });
});

describe('Wire format', () => {
  it('round-trips toWire → fromWire for any amount', () => {
    fc.assert(
      fc.property(currency, fc.bigInt({ min: MIN_MINOR, max: MAX_MINOR }), (c, x) => {
        const a = money(x, c);
        const wire = toWire(a);
        expect(typeof wire.amountMinor).toBe('string');
        expect(equals(fromWire(JSON.parse(JSON.stringify(wire))), a)).toBe(true);
      }),
    );
  });

  it('rejects non-canonical or out-of-range minor strings and unknown currencies', () => {
    for (const bad of ['', '1.5', '007', '-0', ' 1', '1e3', '0x10']) {
      expectDomainError(
        () => fromWire({ amountMinor: bad, currency: 'USD' }),
        'money.invalid_amount',
      );
    }
    expectDomainError(
      () => fromWire({ amountMinor: (MAX_MINOR + 1n).toString(), currency: 'USD' }),
      'money.out_of_range',
    );
    expectDomainError(
      () => fromWire({ amountMinor: '1', currency: 'BTC' }),
      'money.unknown_currency',
    );
  });
});
