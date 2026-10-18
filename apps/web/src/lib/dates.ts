import type { LocalDate } from '@finanz/kernel';
import i18n from 'i18next';
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

const capitalize = (text: string, locale: string) =>
  text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

/**
 * A day's heading in a list: "Hoy, domingo 18 de octubre", "Ayer, sábado 17", "Jueves 15"
 * within this month, "Miércoles 30 de septiembre" before it, with the year for earlier years.
 */
export function dayHeading(date: LocalDate, today: LocalDate, locale = formattingLocale()): string {
  const value = toUtcDate(date);
  const now = toUtcDate(today);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(value);
  const parts = {
    weekday: part({ weekday: 'long' }),
    day: value.getUTCDate(),
    month: part({ month: 'long' }),
    year: value.getUTCFullYear(),
  };
  const days = Math.round((now.getTime() - value.getTime()) / 86_400_000);
  const sameYear = parts.year === now.getUTCFullYear();
  const key =
    days === 0
      ? 'dates.today'
      : days === 1
        ? 'dates.yesterday'
        : sameYear && value.getUTCMonth() === now.getUTCMonth()
          ? 'dates.thisMonth'
          : sameYear
            ? 'dates.otherMonth'
            : 'dates.otherYear';
  return capitalize(i18n.t(key, parts), locale);
}
