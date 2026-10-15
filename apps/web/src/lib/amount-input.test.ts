import { money } from '@finanz/kernel';
import { describe, expect, it } from 'vitest';
import {
  formatAmountInput,
  fractionToPercent,
  parseAmountInput,
  parseRateInput,
  percentToFraction,
} from './amount-input';

describe('parseAmountInput', () => {
  it.each([
    ['50.000', 'es-CO', money(50_000_00n, 'COP')],
    ['1.234.567,89', 'es-CO', money(1_234_567_89n, 'COP')],
    ['$ 3.400', 'es-CO', money(3_400_00n, 'COP')],
    ['3400', 'es-CO', money(3_400_00n, 'COP')],
    ['12,5', 'es-CO', money(12_50n, 'COP')],
    ['50,000', 'es-CO', money(50_000_00n, 'COP')],
    ['-85.000', 'es-CO', money(-85_000_00n, 'COP')],
    ['1,234.56', 'en-US', money(1_234_56n, 'USD')],
    ['25.50', 'en-US', money(25_50n, 'USD')],
    ['1,234.56', 'es-MX', money(1_234_56n, 'MXN')],
    ['5.079,25', 'es-CO', money(5_079_25n, 'MXN')],
  ] as const)('%s (%s)', (text, locale, expected) => {
    expect(parseAmountInput(text, expected.currency, locale)).toEqual(expected);
  });

  it.each(['', 'abc', '1.2.3,4,5', '12,345,6', '1e5', '0,001'])('rejects %j', (text) => {
    expect(() => parseAmountInput(text, 'COP', 'es-CO')).toThrow();
  });
});

describe('formatAmountInput', () => {
  it.each([
    [money(310_000_00n, 'COP'), 'es-CO', '310.000'],
    [money(25_50n, 'USD'), 'es-CO', '25,50'],
    [money(1_234_56n, 'USD'), 'en-US', '1,234.56'],
  ] as const)('%o in %s → %s, and reads back the same', (value, locale, text) => {
    expect(formatAmountInput(value, locale)).toBe(text);
    expect(parseAmountInput(text, value.currency, locale)).toEqual(value);
  });
});

describe('parseRateInput', () => {
  it.each([
    ['4.010,5', 'es-CO', '4010.5'],
    ['4.010', 'es-CO', '4010'],
    ['17,2', 'es-CO', '17.2'],
    ['0,00025', 'es-CO', '0.00025'],
    ['4,010.5', 'en-US', '4010.5'],
    ['17.2', 'es-MX', '17.2'],
  ])('%s (%s) → %s', (text, locale, rate) => {
    expect(parseRateInput(text, locale)).toBe(rate);
  });

  it.each(['', '0', '-4000', 'abc', '1,2,3'])('rejects %j', (text) => {
    expect(parseRateInput(text, 'es-CO')).toBeUndefined();
  });
});

describe('percentToFraction', () => {
  it.each([
    ['1,2', 'es-CO', '0.012'],
    ['26,8242', 'es-CO', '0.268242'],
    ['12', 'es-CO', '0.12'],
    ['100', 'es-CO', '1'],
    ['0,5', 'es-CO', '0.005'],
    ['1.2', 'en-US', '0.012'],
  ])('%s %% (%s) → %s', (text, locale, fraction) => {
    expect(percentToFraction(text, locale)).toBe(fraction);
  });
});

describe('fractionToPercent', () => {
  it.each([
    ['0.012', 'es-CO', '1,2'],
    ['0.268242', 'es-CO', '26,8242'],
    ['0.12', 'es-CO', '12'],
    ['1', 'es-CO', '100'],
    ['0.005', 'es-CO', '0,5'],
    ['0', 'es-CO', '0'],
    ['0.012', 'en-US', '1.2'],
  ])('%s (%s) → %s %%', (fraction, locale, text) => {
    expect(fractionToPercent(fraction, locale)).toBe(text);
    expect(percentToFraction(text, locale)).toBe(fraction);
  });
});
