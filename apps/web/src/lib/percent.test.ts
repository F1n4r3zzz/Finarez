import { money } from '@finanz/kernel';
import { describe, expect, it } from 'vitest';
import { changeRatio, formatPercent } from './percent';

describe('changeRatio', () => {
  it('measures growth in size, also for spending stored as negative amounts', () => {
    expect(changeRatio(money(110n, 'COP'), money(100n, 'COP'))).toBe(0.1);
    expect(changeRatio(money(-285n, 'COP'), money(-250n, 'COP'))).toBe(0.14);
    expect(changeRatio(money(-200n, 'COP'), money(-250n, 'COP'))).toBe(-0.2);
  });

  it('has no ratio without a comparable base', () => {
    expect(changeRatio(money(5n, 'COP'), money(0n, 'COP'))).toBeUndefined();
    expect(changeRatio(money(5n, 'COP'), money(5n, 'USD'))).toBeUndefined();
  });
});

describe('formatPercent', () => {
  const plain = (s: string) => s.replace(/[  ]/g, ' ');

  it('follows each region and shows the sign by default', () => {
    expect(formatPercent(0.14, { locale: 'es-CO' })).toBe('+14%');
    expect(formatPercent(-0.2, { locale: 'es-MX' })).toBe('-20%');
    expect(plain(formatPercent(0.14, { locale: 'es' }))).toBe('+14 %');
  });

  it('can omit the sign for shares of a total', () => {
    expect(formatPercent(0.38, { locale: 'es-CO', signed: false })).toBe('38%');
  });
});
