import { parseLocalDate } from '@finanz/kernel';
import { describe, expect, it } from 'vitest';
import { dayHeading } from './dates';

const today = parseLocalDate('2026-10-18');
const heading = (date: string) => dayHeading(parseLocalDate(date), today, 'es-CO');

describe('dayHeading', () => {
  it('names today and yesterday in full', () => {
    expect(heading('2026-10-18')).toBe('Hoy, domingo 18 de octubre');
    expect(heading('2026-10-17')).toBe('Ayer, sábado 17');
  });

  it('uses the weekday and day within this month', () => {
    expect(heading('2026-10-15')).toBe('Jueves 15');
  });

  it('adds the month for earlier months, and the year for earlier years', () => {
    expect(heading('2026-09-30')).toBe('Miércoles 30 de septiembre');
    expect(heading('2025-12-31')).toBe('Miércoles 31 de diciembre de 2025');
  });
});
