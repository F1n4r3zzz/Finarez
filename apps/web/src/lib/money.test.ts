import { money } from '@finanz/kernel';
import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

// Intl uses non-breaking and narrow spaces; compare with plain spaces.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatMoney', () => {
  it('follows the regional format of each target market', () => {
    expect(plain(formatMoney(money(1_245_000_000n, 'COP'), { locale: 'es-CO' }))).toBe(
      '$ 12.450.000',
    );
    expect(plain(formatMoney(money(1_245_000_050n, 'COP'), { locale: 'es-CO' }))).toBe(
      '$ 12.450.000,50',
    );
    expect(plain(formatMoney(money(123_456n, 'MXN'), { locale: 'es-MX' }))).toBe('$1,234.56');
    expect(plain(formatMoney(money(123_456n, 'USD'), { locale: 'en-US' }))).toBe('$1,234.56');
    expect(plain(formatMoney(money(123_456n, 'EUR'), { locale: 'es-ES' }))).toBe('1234,56 €');
  });

  it('tells dollars apart from pesos in a Colombian format', () => {
    expect(plain(formatMoney(money(123_456n, 'USD'), { locale: 'es-CO' }))).toBe('US$ 1.234,56');
  });

  it('can show the ISO code when currencies are mixed', () => {
    expect(
      plain(formatMoney(money(1_245_000_000n, 'COP'), { locale: 'es-CO', showCode: true })),
    ).toBe('COP 12.450.000');
  });

  it('never rounds the amount shown, even where Intl defaults to no decimals', () => {
    expect(plain(formatMoney(money(1n, 'COP'), { locale: 'es-CO' }))).toBe('$ 0,01');
    expect(plain(formatMoney(money(199n, 'COP'), { locale: 'es-CO' }))).toBe('$ 1,99');
  });

  it('keeps full precision beyond what a float can hold', () => {
    // 900,719,925,474,099.93 is not representable as a double.
    expect(formatMoney(money(90_071_992_547_409_993n, 'USD'), { locale: 'en-US' })).toBe(
      '$900,719,925,474,099.93',
    );
  });

  it('shows explicit signs for income and expenses', () => {
    const opts = { locale: 'es-CO', signDisplay: 'exceptZero' } as const;
    expect(plain(formatMoney(money(420_000_000n, 'COP'), opts))).toBe('+$ 4.200.000');
    expect(plain(formatMoney(money(-3_200_000n, 'COP'), opts))).toBe('-$ 32.000');
  });
});
