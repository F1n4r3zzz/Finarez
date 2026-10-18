import { describe, expect, it } from 'vitest';
import { monogram } from './monogram';

describe('monogram', () => {
  it('takes the first letters of the first two words', () => {
    expect(monogram('Bancolombia Ahorros')).toBe('BA');
    expect(monogram('crédito vehículo')).toBe('CV');
  });

  it('skips Spanish connectors such as "de"', () => {
    expect(monogram('Fondo de inversión Bancolombia')).toBe('FI');
    expect(monogram('Servicios del hogar')).toBe('SH');
  });

  it('uses the first two letters of a single word', () => {
    expect(monogram('Nequi')).toBe('Ne');
    expect(monogram('Mercado')).toBe('Me');
    expect(monogram('  éxito ')).toBe('Éx');
  });

  it('falls back to a question mark for an empty name', () => {
    expect(monogram('')).toBe('?');
    expect(monogram('   ')).toBe('?');
  });
});
