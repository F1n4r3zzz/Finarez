import { type LocalDate, parseLocalDate } from '@finanz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  figures,
  type Limit,
  limitIn,
  nextPeriod,
  PERIOD_KINDS,
  periodOf,
  periodsBetween,
} from './periods';

const d = parseLocalDate;

describe('periods', () => {
  it('are calendar months, quarters and years', () => {
    expect(periodOf('monthly', d('2026-02-14'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodOf('monthly', d('2024-02-29'))).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(periodOf('quarterly', d('2026-05-31'))).toEqual({
      from: '2026-04-01',
      to: '2026-06-30',
    });
    expect(periodOf('quarterly', d('2025-12-31'))).toEqual({
      from: '2025-10-01',
      to: '2025-12-31',
    });
    expect(periodOf('yearly', d('2026-07-04'))).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('follow each other without gaps, across years', () => {
    expect(nextPeriod('monthly', periodOf('monthly', d('2025-12-03')))).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(
      periodsBetween('quarterly', d('2025-11-20'), d('2026-04-01')).map((p) => p.from),
    ).toEqual(['2025-10-01', '2026-01-01', '2026-04-01']);
    fc.assert(
      fc.property(
        fc.constantFrom(...PERIOD_KINDS),
        fc.date({ min: new Date('2000-01-01'), max: new Date('2099-12-31'), noInvalidDate: true }),
        (kind, date) => {
          const p = periodOf(kind, d(date.toISOString().slice(0, 10)));
          const next = nextPeriod(kind, p);
          const dayAfter = new Date(`${p.to}T00:00:00Z`);
          dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
          expect(next.from).toBe(dayAfter.toISOString().slice(0, 10));
          expect(periodOf(kind, next.from)).toEqual(next);
        },
      ),
    );
  });
});

const limits = (...pairs: [string, number][]): Limit[] =>
  pairs.map(([from, amount]) => ({
    effectiveFrom: from as LocalDate,
    amountMinor: BigInt(amount),
  }));

describe('limits', () => {
  it('apply from their period on, until the next change', () => {
    const history = limits(['2026-01-01', 100], ['2026-04-01', 150]);
    expect(limitIn(history, periodOf('monthly', d('2026-03-10')))).toBe(100n);
    expect(limitIn(history, periodOf('monthly', d('2026-04-10')))).toBe(150n);
    expect(limitIn(history, periodOf('monthly', d('2026-09-10')))).toBe(150n);
  });
});

describe('figures', () => {
  const months = periodsBetween('monthly', d('2026-01-01'), d('2026-03-31'));
  const spent = new Map([
    ['2026-01-01', 70n],
    ['2026-02-01', 150n],
    ['2026-03-01', 40n],
  ]);
  const spentIn = (p: { from: LocalDate }) => spent.get(p.from) ?? 0n;

  it('judge each period on its own without carryover; overspent means strictly more', () => {
    const rows = figures(months, limits(['2026-01-01', 100]), false, spentIn);
    expect(rows.map((r) => [r.carried, r.remaining, r.overspent])).toEqual([
      [0n, 30n, false],
      [0n, -50n, true],
      [0n, 60n, false],
    ]);
    expect(
      figures(months.slice(0, 1), limits(['2026-01-01', 70]), false, spentIn)[0]?.overspent,
    ).toBe(false);
  });

  it('move what is left, or overspent, into the next period with carryover', () => {
    const rows = figures(months, limits(['2026-01-01', 100]), true, spentIn);
    expect(rows.map((r) => [r.carried, r.available, r.remaining, r.overspent])).toEqual([
      [0n, 100n, 30n, false],
      [30n, 130n, -20n, true],
      [-20n, 80n, 40n, false],
    ]);
  });
});
