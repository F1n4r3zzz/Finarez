import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import { compareLocalDate, parseLocalDate, todayIn } from './local-date';

describe('LocalDate', () => {
  it('accepts real calendar dates, including leap days', () => {
    expect(parseLocalDate('2026-10-14')).toBe('2026-10-14');
    expect(parseLocalDate('2028-02-29')).toBe('2028-02-29');
  });

  it('rejects impossible or malformed dates', () => {
    for (const bad of ['2026-02-29', '2026-13-01', '2026-04-31', '2026-1-5', '14/10/2026', '']) {
      expect(() => parseLocalDate(bad)).toThrow(DomainError);
    }
  });

  it('computes today in the user time zone, not the server zone', () => {
    const instant = new Date('2026-10-14T03:30:00Z');
    expect(todayIn('America/Bogota', instant)).toBe('2026-10-13');
    expect(todayIn('America/Mexico_City', instant)).toBe('2026-10-13');
    expect(todayIn('Europe/Madrid', instant)).toBe('2026-10-14');
  });

  it('rejects unknown time zones with a domain error', () => {
    expect(() => todayIn('Mars/Olympus')).toThrow(DomainError);
  });

  it('orders dates chronologically', () => {
    const a = parseLocalDate('2026-01-31');
    const b = parseLocalDate('2026-02-01');
    expect(compareLocalDate(a, b)).toBe(-1);
    expect(compareLocalDate(b, a)).toBe(1);
    expect(compareLocalDate(a, a)).toBe(0);
  });
});
