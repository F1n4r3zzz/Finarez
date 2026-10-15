import { parseLocalDate, parseRate } from '@finanz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  installmentFor,
  interestFor,
  monthlyFromAnnual,
  projectSchedule,
  proposeSplit,
  ZERO_RATE,
} from './schedule';

const PESOS = 100n; // COP interest is rounded to whole pesos, as banks do
const cop = (pesos: number) => BigInt(pesos) * 100n;
const monthly12 = parseRate('0.012');

describe('the car loan of the freelancer fixture', () => {
  it('reproduces the installment from the original terms', () => {
    expect(installmentFor(cop(48_000_000), monthly12, 48, PESOS)).toBe(cop(1_321_322));
  });

  it('reproduces a year of the amortization sheet to the peso', () => {
    const rows = projectSchedule({
      outstandingMinor: cop(38_441_578),
      rate: monthly12,
      installmentMinor: cop(1_321_322),
      increment: PESOS,
      firstDueOn: parseLocalDate('2025-10-28'),
      dueDay: 28,
    }).slice(0, 12);
    expect(rows[0]).toMatchObject({
      interestMinor: cop(461_299),
      principalMinor: cop(860_023),
      balanceAfterMinor: cop(37_581_555),
    });
    expect(rows.reduce((s, r) => s + r.interestMinor, 0n)).toBe(cop(4_826_455));
    expect(rows.reduce((s, r) => s + r.principalMinor, 0n)).toBe(cop(11_029_409));
    expect(rows.at(-1)?.balanceAfterMinor).toBe(cop(27_412_169));
    expect(rows.map((r) => r.dueOn).slice(3, 6)).toEqual([
      '2026-01-28',
      '2026-02-28',
      '2026-03-28',
    ]);
  });

  it('pays off in the agreed 48 months: the last installment absorbs the rounding residue', () => {
    const rows = projectSchedule({
      outstandingMinor: cop(48_000_000),
      rate: monthly12,
      installmentMinor: cop(1_321_322),
      increment: PESOS,
      firstDueOn: parseLocalDate('2024-10-28'),
      dueDay: 28,
      remainingInstallments: 48,
    });
    expect(rows).toHaveLength(48);
    expect(rows.at(-1)?.balanceAfterMinor).toBe(0n);
    expect(rows.at(-1)?.installmentMinor).toBe(cop(1_321_355));
  });

  it('without a known term, a residue becomes one small extra installment', () => {
    const rows = projectSchedule({
      outstandingMinor: cop(48_000_000),
      rate: monthly12,
      installmentMinor: cop(1_321_322),
      increment: PESOS,
      firstDueOn: parseLocalDate('2024-10-28'),
      dueDay: 28,
    });
    expect(rows).toHaveLength(49);
    expect(rows.at(-1)?.installmentMinor).toBe(cop(33));
  });
});

describe('payment split', () => {
  it('takes the period interest first; the rest reduces the debt', () => {
    expect(proposeSplit(cop(38_441_578), cop(1_321_322), monthly12, PESOS)).toEqual({
      interestMinor: cop(461_299),
      principalMinor: cop(860_023),
    });
  });

  it('a payment smaller than the interest is all interest', () => {
    expect(proposeSplit(cop(1_000_000), cop(5_000), monthly12, PESOS)).toEqual({
      interestMinor: cop(5_000),
      principalMinor: 0n,
    });
  });

  it('interest-free debts split all to principal', () => {
    expect(proposeSplit(cop(1_000), cop(500), ZERO_RATE, PESOS)).toEqual({
      interestMinor: 0n,
      principalMinor: cop(500),
    });
    expect(installmentFor(cop(1_200), ZERO_RATE, 12, PESOS)).toBe(cop(100));
  });

  it('USD interest is rounded to cents', () => {
    expect(interestFor(1_000_00n, parseRate('0.0123456'), 1n)).toBe(12_35n); // 12,3456 → 12,35
  });
});

describe('monthlyFromAnnual', () => {
  it('turns an effective annual rate into its monthly equivalent', () => {
    const m = monthlyFromAnnual(parseRate('0.268242'));
    // (1.02)^12 = 1.268241794… so 26.8242 % EA is just over 2 % a month
    expect(Number(m.numerator) / Number(m.denominator)).toBeCloseTo(0.02, 7);
  });

  it('compounds back to the annual rate within 18-digit precision', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999_999 }), (bp) => {
        const annual = parseRate(`0.${bp.toString().padStart(6, '0')}`);
        const m = monthlyFromAnnual(annual);
        const back = (m.denominator + m.numerator) ** 12n; // over denominator^12
        const target =
          ((annual.denominator + annual.numerator) * m.denominator ** 12n) / annual.denominator;
        const diff = back > target ? back - target : target - back;
        expect(diff * 10n ** 15n < target).toBe(true); // relative error below 1e-15
      }),
      { numRuns: 200 },
    );
  });
});
