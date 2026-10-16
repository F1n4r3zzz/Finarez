import { type LocalDate, parseLocalDate } from './local-date';

export const FREQUENCIES = ['monthly', 'twice_monthly', 'weekly', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/**
 * When something repeats. The anchor is one date it happens on: it gives the day of the month
 * (monthly), the weekday (weekly) or the month and day (yearly). Twice a month adds a second
 * day of the month. Days past a month's end fall on its last day (31 → 30 April, 28 February).
 */
export interface Schedule {
  frequency: Frequency;
  anchor: LocalDate;
  /** Twice a month only: the other day, 1–31. */
  secondDay?: number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const parts = (date: LocalDate) => date.split('-').map(Number) as [number, number, number];

function onDay(year: number, month: number, day: number): LocalDate {
  return parseLocalDate(`${year}-${pad(month)}-${pad(Math.min(day, lastDay(year, month)))}`);
}

function addDays(date: LocalDate, days: number): LocalDate {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return parseLocalDate(t.toISOString().slice(0, 10));
}

/** The first date strictly after `after` on which the schedule happens. */
export function nextOccurrence(schedule: Schedule, after: LocalDate): LocalDate {
  const [, anchorMonth, anchorDay] = parts(schedule.anchor);
  const [year, month] = parts(after);
  switch (schedule.frequency) {
    case 'weekly': {
      const days = Math.round(
        (Date.parse(`${after}T00:00:00Z`) - Date.parse(`${schedule.anchor}T00:00:00Z`)) /
          86_400_000,
      );
      return addDays(after, 7 - (((days % 7) + 7) % 7));
    }
    case 'yearly': {
      const thisYear = onDay(year, anchorMonth, anchorDay);
      return thisYear > after ? thisYear : onDay(year + 1, anchorMonth, anchorDay);
    }
    case 'monthly':
    case 'twice_monthly': {
      const days =
        schedule.frequency === 'monthly'
          ? [anchorDay]
          : [anchorDay, schedule.secondDay ?? anchorDay].sort((a, b) => a - b);
      for (const [y, m] of [
        [year, month],
        month === 12 ? [year + 1, 1] : [year, month + 1],
      ] as const) {
        for (const d of days) {
          const date = onDay(y, m, d);
          if (date > after) return date;
        }
      }
      throw new Error(`No occurrence after ${after}`);
    }
  }
}

/** The schedule's dates from `from` (included) on, at most `count` of them. */
export function occurrencesFrom(schedule: Schedule, from: LocalDate, count: number): LocalDate[] {
  const dates: LocalDate[] = [];
  let date = nextOccurrence(schedule, addDays(from, -1));
  while (dates.length < count) {
    dates.push(date);
    date = nextOccurrence(schedule, date);
  }
  return dates;
}
