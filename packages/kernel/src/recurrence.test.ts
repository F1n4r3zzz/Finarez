import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type LocalDate, parseLocalDate } from './local-date';
import { FREQUENCIES, nextOccurrence, occurrencesFrom, type Schedule } from './recurrence';

const d = parseLocalDate;
const from = (schedule: Schedule, start: string, count: number) =>
  occurrencesFrom(schedule, d(start), count);

describe('schedules', () => {
  it('repeat monthly on the anchor day, on the last day when the month is shorter', () => {
    expect(from({ frequency: 'monthly', anchor: d('2026-01-31') }, '2026-01-31', 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(from({ frequency: 'monthly', anchor: d('2026-10-05') }, '2026-10-06', 2)).toEqual([
      '2026-11-05',
      '2026-12-05',
    ]);
  });

  it('repeat twice a month on two days (quincena), whichever comes first', () => {
    const quincena: Schedule = {
      frequency: 'twice_monthly',
      anchor: d('2026-01-30'),
      secondDay: 15,
    };
    expect(from(quincena, '2026-01-20', 5)).toEqual([
      '2026-01-30',
      '2026-02-15',
      '2026-02-28',
      '2026-03-15',
      '2026-03-30',
    ]);
  });

  it('repeat weekly on the anchor weekday and yearly on its date, 29 February included', () => {
    expect(from({ frequency: 'weekly', anchor: d('2026-10-16') }, '2026-10-01', 3)).toEqual([
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
    ]);
    expect(from({ frequency: 'yearly', anchor: d('2028-02-29') }, '2028-02-29', 3)).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
    ]);
  });

  it('always move forward, and the anchor itself is one of the dates', () => {
    const date = fc
      .date({ min: new Date('2000-01-01'), max: new Date('2090-12-31'), noInvalidDate: true })
      .map((t) => d(t.toISOString().slice(0, 10)));
    fc.assert(
      fc.property(
        fc.constantFrom(...FREQUENCIES),
        date,
        date,
        fc.integer({ min: 1, max: 31 }),
        (frequency, anchor, after, secondDay) => {
          const schedule: Schedule = { frequency, anchor, secondDay };
          const next = nextOccurrence(schedule, after);
          expect(next > after).toBe(true);
          // Nothing is skipped: from the day before `next`, `next` comes first again.
          const dayBefore = new Date(`${next}T00:00:00Z`);
          dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
          expect(nextOccurrence(schedule, dayBefore.toISOString().slice(0, 10) as LocalDate)).toBe(
            next,
          );
          expect(occurrencesFrom(schedule, anchor, 1)[0]).toBe(anchor);
        },
      ),
    );
  });
});
