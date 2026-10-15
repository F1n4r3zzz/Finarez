import { parseLocalDate } from '@finanz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { monthlyNeeded, monthsLeft } from './progress';

const d = parseLocalDate;

describe('monthsLeft', () => {
  it('counts the current month and the target month', () => {
    expect(monthsLeft(d('2026-10-15'), d('2026-12-31'))).toBe(3);
    expect(monthsLeft(d('2026-10-15'), d('2026-10-31'))).toBe(1);
    expect(monthsLeft(d('2026-10-15'), d('2027-06-30'))).toBe(9);
  });

  it('leaves one month when the date has passed', () => {
    expect(monthsLeft(d('2026-10-15'), d('2026-01-31'))).toBe(1);
  });
});

describe('monthlyNeeded', () => {
  it('spreads what is missing over the months left, in whole pesos, rounding up', () => {
    // 60.000.000 target, 36.000.000 saved, 3 months: 8.000.000 a month.
    expect(monthlyNeeded(60_000_000_00n, 36_000_000_00n, 3, 100n)).toBe(8_000_000_00n);
    // 100 pesos over 3 months: 34 a month, never short.
    expect(monthlyNeeded(100_00n, 0n, 3, 100n)).toBe(34_00n);
  });

  it('is zero once the target is met', () => {
    expect(monthlyNeeded(10_00n, 12_00n, 4, 1n)).toBe(0n);
  });

  it('always reaches the target and never asks for a whole unit more than needed', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 15n }),
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.integer({ min: 1, max: 600 }),
        fc.constantFrom(1n, 100n),
        (target, saved, months, unit) => {
          const each = monthlyNeeded(target, saved, months, unit);
          const missing = target - saved;
          if (missing <= 0n) {
            expect(each).toBe(0n);
          } else {
            expect(each % unit).toBe(0n);
            expect(each * BigInt(months)).toBeGreaterThanOrEqual(missing);
            expect((each - unit) * BigInt(months)).toBeLessThan(missing);
          }
        },
      ),
    );
  });
});
