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

/** "28 oct 2026": for lists that span several years. */
export function formatMediumDate(date: LocalDate, locale = formattingLocale()): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(toUtcDate(date));
}

/** "1 de octubre de 2025": a date that names its year, for ranges. */
export function formatFullDate(date: LocalDate, locale = formattingLocale()): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(toUtcDate(date));
}

export function formatMonthName(date: LocalDate, locale = formattingLocale()): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    toUtcDate(date),
  );
}

/** "martes, 10 de marzo", with the year when it isn't the current one. */
export function formatLongDate(date: LocalDate, locale = formattingLocale()): string {
  const value = toUtcDate(date);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(value.getUTCFullYear() === new Date().getUTCFullYear() ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(value);
}
