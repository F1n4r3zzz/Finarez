import type { LocalDate } from '@finanz/kernel';
import { formattingLocale } from './locale';

function toUtcDate(date: LocalDate): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

/** "13 oct" style. Formatted in UTC so the calendar date never shifts with the viewer's zone. */
export function formatShortDate(date: LocalDate, locale = formattingLocale()): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(toUtcDate(date));
}

export function formatMonthName(date: LocalDate, locale = formattingLocale()): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    toUtcDate(date),
  );
}
