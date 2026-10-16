import { type LocalDate, parseLocalDate } from '@finanz/kernel';
import { formattingLocale } from '../../lib/locale';

const firstDay = (date: string) => new Date(`${date.slice(0, 7)}-01T00:00:00Z`);

/** "octubre de 2026". */
export function monthYear(date: string, locale = formattingLocale()): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(firstDay(date));
}

/** "octubre". */
export function monthName(date: string, locale = formattingLocale()): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(firstDay(date));
}

/** "oct", for chart ticks. */
export function shortMonth(date: string, locale = formattingLocale()): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    .format(firstDay(date))
    .replace('.', '');
}

/** "2026-10" plus `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Every month from `first` to `last`, both included ("2026-10" style). */
export function monthsFrom(first: string, last: string): string[] {
  const months: string[] = [];
  for (let m = first; m <= last; m = shiftMonth(m, 1)) months.push(m);
  return months;
}

/** Days from `today` to the end of the period, today included. */
export function daysLeft(today: LocalDate, to: LocalDate): number {
  const day = 86_400_000;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / day) + 1;
}

/** The first day of the month a "2026-10" value names. */
export const monthStart = (month: string): LocalDate => parseLocalDate(`${month}-01`);
