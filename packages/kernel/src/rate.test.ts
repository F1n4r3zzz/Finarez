import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { money } from './money';
import {
  convert,
  convertMinor,
  divRoundHalfEven,
  formatRate,
  invertRate,
  multiplyRates,
  parseRate,
} from './rate';

describe('parseRate', () => {
  it('reads exact positive decimals with up to 18 fraction digits', () => {
    expect(formatRate(parseRate('4000.5'))).toBe('4000.5');
    expect(formatRate(parseRate('3980'))).toBe('3980');
    expect(formatRate(parseRate('0.000250000'))).toBe('0.00025');
    expect(formatRate(parseRate('1.123456789012345678'))).toBe('1.123456789012345678');
  });

  it.each([
    '0',
    '0.000',
    '-1',
    '1e3',
    '1,5',
    ' 2',
    '1.1234567890123456789',
    '',
    '123456789012345678901',
  ])('rejects %j', (input) => {
    expect(() => parseRate(input)).toThrow(/rate/i);
  });
});

describe('divRoundHalfEven', () => {
  it.each([
    [5n, 10n, 0n],
    [15n, 10n, 2n],
    [25n, 10n, 2n],
    [26n, 10n, 3n],
    [-5n, 10n, 0n],
    [-15n, 10n, -2n],
    [-25n, 10n, -2n],
    [-26n, 10n, -3n],
    [7n, 1n, 7n],
  ])('%s / %s rounds half to even: %s', (n, d, q) => {
    expect(divRoundHalfEven(n, d)).toBe(q);
  });
});

describe('convertMinor', () => {
  it('multiplies exactly and rounds once, half to even', () => {
    const rate = parseRate('4000.5');
    expect(convertMinor(100n, 2, 2, rate)).toBe(400050n); // 1,00 USD → 4.000,50 COP
    expect(convertMinor(1n, 2, 2, rate)).toBe(4000n); // 4.000,5 → 4.000 (even)
    expect(convertMinor(3n, 2, 2, rate)).toBe(12002n); // 12.001,5 → 12.002 (even)
    expect(convertMinor(-2n, 2, 2, rate)).toBe(-8001n);
  });

  it('handles currencies with 0 and 3 decimals', () => {
    expect(convertMinor(150n, 2, 0, parseRate('150'))).toBe(225n); // 1,50 → 225 (0 decimals)
    expect(convertMinor(100n, 2, 3, parseRate('0.307'))).toBe(307n); // 1,00 → 0,307 (3 decimals)
    expect(convertMinor(1234n, 3, 2, parseRate('1'))).toBe(123n); // 1,234 → 1,23
    expect(convertMinor(1235n, 3, 2, parseRate('1'))).toBe(124n); // 1,235 → 1,24 (even)
  });
});

describe('convert', () => {
  it('converts Money into the target currency', () => {
    expect(convert(money(2581_00n, 'USD'), parseRate('3920'), 'COP')).toEqual(
      money(10_117_520_00n, 'COP'),
    );
  });
});

describe('rate arithmetic', () => {
  it('multiplies exactly (paths through USD)', () => {
    expect(formatRate(multiplyRates(parseRate('0.5'), parseRate('4000.5')))).toBe('2000.25');
  });

  it('inverts exactly; the text shows 18 places when the inverse repeats', () => {
    expect(formatRate(invertRate(parseRate('4000')))).toBe('0.00025');
    expect(formatRate(invertRate(parseRate('3')))).toBe('0.333333333333333333');
    expect(formatRate(invertRate(parseRate('1.5')))).toBe('0.666666666666666667');
    expect(invertRate(invertRate(parseRate('17.2')))).toEqual(parseRate('17.2'));
  });

  it('rounds a conversion once, even through an inverse (CP2 code #3)', () => {
    // 1 minor unit at the exact inverse of 1.999999999999999999 is 0.5000000000000000003 → 1.
    expect(convertMinor(1n, 2, 2, invertRate(parseRate('1.999999999999999999')))).toBe(1n);
    // Through USD: 1 MXN = 3800/19 COP = exactly 200.
    const mxnCop = multiplyRates(invertRate(parseRate('19')), parseRate('3800'));
    expect(formatRate(mxnCop)).toBe('200');
    expect(convertMinor(5_079_25n, 2, 2, mxnCop)).toBe(1_015_850_00n);
  });
});

describe('conversion properties', () => {
  const amount = fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n });
  const rateText = fc
    .tuple(fc.integer({ min: 0, max: 99_999 }), fc.integer({ min: 0, max: 999_999 }))
    .filter(([w, f]) => w + f > 0)
    .map(([w, f]) => `${w}.${f.toString().padStart(6, '0')}`);

  it('is symmetric around zero (no bias toward either sign)', () => {
    fc.assert(
      fc.property(amount, rateText, (a, r) => {
        const rate = parseRate(r);
        expect(convertMinor(-a, 2, 2, rate)).toBe(-convertMinor(a, 2, 2, rate));
      }),
    );
  });

  it('is off by at most half a minor unit from the exact value', () => {
    fc.assert(
      fc.property(amount, rateText, (a, r) => {
        const rate = parseRate(r);
        const exactTimes2 = (2n * a * rate.numerator) / rate.denominator;
        const diff = 2n * convertMinor(a, 2, 2, rate) - exactTimes2;
        expect(diff >= -2n && diff <= 2n).toBe(true);
      }),
    );
  });

  it('a rate of 1 between equal minor units changes nothing', () => {
    fc.assert(
      fc.property(amount, (a) => {
        expect(convertMinor(a, 2, 2, parseRate('1'))).toBe(a);
      }),
    );
  });
});
