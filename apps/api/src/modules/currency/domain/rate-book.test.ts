import {
  type CurrencyCode,
  convertMinor,
  formatRate,
  parseLocalDate,
  parseRate,
} from '@finanz/kernel';
import { describe, expect, it } from 'vitest';
import { RateBook, type RateRow } from './rate-book';

const day = parseLocalDate;

function row(
  id: string,
  pair: `${CurrencyCode}/${CurrencyCode}`,
  rate: string,
  validFrom: string,
  origin: RateRow['origin'] = 'user',
  source: string | null = null,
): RateRow {
  const [base, quote] = pair.split('/') as [CurrencyCode, CurrencyCode];
  return { id, origin, source, base, quote, validFrom: day(validFrom), rate: parseRate(rate) };
}

const found = (book: RateBook, from: CurrencyCode, to: CurrencyCode, on: string) => {
  const quote = book.find(from, to, day(on));
  return (
    quote && {
      rate: formatRate(quote.rate),
      legs: quote.legs.map((l) => l.rateId),
      stale: quote.stale,
    }
  );
};

describe('RateBook', () => {
  it('uses the newest rate that is already valid on the day (a step function)', () => {
    const book = new RateBook([
      row('sep', 'USD/COP', '3980', '2025-09-01'),
      row('oct', 'USD/COP', '4010', '2025-10-01'),
    ]);
    expect(found(book, 'USD', 'COP', '2025-09-30')?.rate).toBe('3980');
    expect(found(book, 'USD', 'COP', '2025-10-01')?.rate).toBe('4010');
    expect(found(book, 'USD', 'COP', '2025-10-31')?.rate).toBe('4010');
    expect(found(book, 'USD', 'COP', '2025-08-31')).toBeUndefined();
  });

  it('converts a currency to itself at exactly 1, with no rate', () => {
    expect(found(new RateBook([]), 'COP', 'COP', '2026-01-01')).toEqual({
      rate: '1',
      legs: [],
      stale: false,
    });
  });

  it('inverts when only the opposite direction exists', () => {
    const book = new RateBook([row('r', 'USD/COP', '4000', '2026-01-01')]);
    expect(found(book, 'COP', 'USD', '2026-01-15')?.rate).toBe('0.00025');
  });

  it('prefers the user rate over any provider rate, and a direct pair over triangulation', () => {
    const book = new RateBook(
      [
        row('prov', 'USD/COP', '3900', '2026-01-01', 'provider', 'bank'),
        row('mine', 'USD/COP', '3950', '2026-01-01'),
        row('mxn-usd', 'USD/MXN', '18', '2026-01-01'),
        row('mxn-cop', 'MXN/COP', '220', '2026-01-01', 'provider', 'bank'),
      ],
      ['bank'],
    );
    expect(found(book, 'USD', 'COP', '2026-02-01')?.legs).toEqual(['mine']);
    expect(found(book, 'MXN', 'COP', '2026-02-01')?.legs).toEqual(['mxn-cop']);
  });

  it('follows the provider priority', () => {
    const book = new RateBook(
      [
        row('b', 'USD/COP', '3900', '2026-01-01', 'provider', 'second'),
        row('a', 'USD/COP', '3910', '2026-01-01', 'provider', 'first'),
      ],
      ['first', 'second'],
    );
    expect(found(book, 'USD', 'COP', '2026-01-02')?.legs).toEqual(['a']);
  });

  it('goes through USD when no direct pair exists (the fixture: MXN → COP)', () => {
    const book = new RateBook([
      row('usd-cop', 'USD/COP', '3800', '2026-06-01'),
      row('usd-mxn', 'USD/MXN', '19', '2026-06-01'),
    ]);
    const quote = found(book, 'MXN', 'COP', '2026-06-15');
    expect(quote?.legs).toEqual(['usd-mxn', 'usd-cop']);
    // 1 MXN = (1/19) USD × 3800 COP. The inverse is kept to 18 places, so the product is a
    // hair under 200; converted amounts still round to the exact result.
    expect(quote?.rate).toBe('199.9999999999999998');
    const rate = book.find('MXN', 'COP', day('2026-06-15'))?.rate;
    expect(rate && convertMinor(5_079_25n, 2, 2, rate)).toBe(1_015_850_00n);
  });

  it('reports a missing rate instead of guessing', () => {
    const book = new RateBook([row('usd-cop', 'USD/COP', '3800', '2026-06-01')]);
    expect(found(book, 'EUR', 'COP', '2026-06-15')).toBeUndefined();
  });

  it('flags rates older than 45 days as stale, but still uses them', () => {
    const book = new RateBook([row('old', 'USD/COP', '3800', '2026-01-01')]);
    expect(found(book, 'USD', 'COP', '2026-02-15')?.stale).toBe(false);
    expect(found(book, 'USD', 'COP', '2026-02-16')?.stale).toBe(true);
  });
});
