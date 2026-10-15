import { type LocalDate, parseLocalDate } from '@finanz/kernel';
import { describe, expect, it } from 'vitest';
import { customPeriod, periodFromSearch, presetPeriod, shiftMonths } from './period';

const d = (s: string) => parseLocalDate(s);
const today = d('2026-10-15');
const span = (p: { from: LocalDate; to: LocalDate }) => [p.from, p.to];

describe('report periods', () => {
  it.each([
    ['month', ['2026-10-01', '2026-10-15'], ['2026-09-01', '2026-09-15']],
    ['last-month', ['2026-09-01', '2026-09-30'], ['2026-08-01', '2026-08-31']],
    ['3m', ['2026-08-01', '2026-10-15'], ['2026-05-01', '2026-07-15']],
    ['12m', ['2025-11-01', '2026-10-15'], ['2024-11-01', '2025-10-15']],
    ['year', ['2026-01-01', '2026-10-15'], ['2025-01-01', '2025-10-15']],
  ] as const)('%s covers %j and compares with %j', (id, range, previous) => {
    const p = presetPeriod(id, today);
    expect(span(p)).toEqual(range);
    expect(span(p.previous)).toEqual(previous);
  });

  it('compares a whole short month with the whole month before it', () => {
    const p = presetPeriod('last-month', d('2026-03-10'));
    expect(span(p)).toEqual(['2026-02-01', '2026-02-28']);
    expect(span(p.previous)).toEqual(['2026-01-01', '2026-01-31']);
  });

  it('keeps day 31 inside shorter months', () => {
    expect(shiftMonths(d('2026-03-31'), -1)).toBe('2026-02-28');
    expect(shiftMonths(d('2024-03-31'), -1)).toBe('2024-02-29');
    expect(shiftMonths(d('2026-01-31'), -12)).toBe('2025-01-31');
  });

  it('compares a typed range with the same number of days just before it', () => {
    const p = customPeriod(d('2026-03-10'), d('2026-03-19'));
    expect(span(p.previous)).toEqual(['2026-02-28', '2026-03-09']);
  });

  it('reads the period from the address, falling back to the last 12 months', () => {
    const read = (q: string) => periodFromSearch(new URLSearchParams(q), today);
    expect(read('period=6m').period.from).toBe('2026-05-01');
    expect(read('').period.id).toBe('12m');
    expect(read('period=custom&from=2026-01-01&to=2026-02-15')).toMatchObject({
      invalid: false,
      period: { id: 'custom', from: '2026-01-01', to: '2026-02-15' },
    });
    expect(read('period=custom&from=2026-03-01&to=2026-01-01')).toMatchObject({
      invalid: true,
      period: { id: '12m' },
    });
    expect(read('period=custom&from=2019-01-01&to=2026-01-01').invalid).toBe(true);
  });
});
