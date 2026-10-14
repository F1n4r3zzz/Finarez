import { DomainError } from './errors';

/**
 * A calendar date ("2026-10-14") with no time or zone. Financial events happen on a date in
 * the user's time zone; instants (timestamptz) are only for technical metadata.
 */
export type LocalDate = string & { readonly __brand: 'LocalDate' };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLocalDate(value: string): LocalDate {
  const match = ISO_DATE.exec(value);
  if (match) {
    const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return value as LocalDate;
    }
  }
  throw new DomainError('date.invalid', `Invalid calendar date: "${value}"`);
}

/** Today's date as seen in `timeZone` (IANA name, e.g. "America/Bogota"). */
export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  } catch {
    throw new DomainError('date.invalid_time_zone', `Unknown time zone: "${timeZone}"`);
  }
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value;
  return parseLocalDate(`${part('year')}-${part('month')}-${part('day')}`);
}

export function compareLocalDate(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
