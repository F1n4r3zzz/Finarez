import { type LocalDate, parseLocalDate } from '@finanz/kernel';

export const PRESETS = ['month', 'last-month', '3m', '6m', '12m', 'year'] as const;
export type Preset = (typeof PRESETS)[number];
export type PeriodId = Preset | 'custom';

/** How the comparison period relates to the chosen one, for the "frente a …" labels. */
export type Comparison =
  | 'lastMonthSoFar'
  | 'monthBefore'
  | 'monthsBefore'
  | 'lastYearSoFar'
  | 'before';

export interface Period {
  id: PeriodId;
  from: LocalDate;
  to: LocalDate;
  /** The same stretch of time just before, to compare with. */
  previous: { from: LocalDate; to: LocalDate; kind: Comparison; months?: number };
}

/** Monthly charts span at most this many months (the API refuses longer ranges). */
export const MAX_MONTHS = 60;

const parts = (date: LocalDate) => date.split('-').map(Number) as [number, number, number];
const iso = (y: number, m: number, d: number) =>
  parseLocalDate(new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10));
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The same day `months` months away, clamped to that month's length (31 → 30 or 28). */
export function shiftMonths(date: LocalDate, months: number): LocalDate {
  const [y, m, d] = parts(date);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const [ty, tm] = [target.getUTCFullYear(), target.getUTCMonth() + 1];
  return iso(ty, tm, Math.min(d, lastDay(ty, tm)));
}

const firstOfMonth = (date: LocalDate, monthsBack = 0) => {
  const [y, m] = parts(date);
  return iso(y, m - monthsBack, 1);
};
const isLastDay = (date: LocalDate) => {
  const [y, m, d] = parts(date);
  return d === lastDay(y, m);
};
const addDays = (date: LocalDate, days: number) => {
  const [y, m, d] = parts(date);
  return iso(y, m, d + days);
};

/** Calendar months touched by [from, to]. */
export function monthCount(from: LocalDate, to: LocalDate): number {
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** The previous stretch for whole-month ranges: the same days, `months` months earlier. */
function monthsEarlier(from: LocalDate, to: LocalDate, months: number) {
  const prevTo = shiftMonths(to, -months);
  const [y, m] = parts(prevTo);
  return {
    from: shiftMonths(from, -months),
    // A range ending on a month's last day compares with the whole earlier month.
    to: isLastDay(to) ? iso(y, m, lastDay(y, m)) : prevTo,
  };
}

export function presetPeriod(id: Preset, today: LocalDate): Period {
  switch (id) {
    case 'month': {
      const from = firstOfMonth(today);
      return {
        id,
        from,
        to: today,
        previous: { ...monthsEarlier(from, today, 1), kind: 'lastMonthSoFar' },
      };
    }
    case 'last-month': {
      const from = firstOfMonth(today, 1);
      const to = addDays(firstOfMonth(today), -1);
      return { id, from, to, previous: { ...monthsEarlier(from, to, 1), kind: 'monthBefore' } };
    }
    case 'year': {
      const from = iso(parts(today)[0], 1, 1);
      return {
        id,
        from,
        to: today,
        previous: { ...monthsEarlier(from, today, 12), kind: 'lastYearSoFar' },
      };
    }
    default: {
      const months = Number(id.replace('m', ''));
      const from = firstOfMonth(today, months - 1);
      return {
        id,
        from,
        to: today,
        previous: { ...monthsEarlier(from, today, months), kind: 'monthsBefore', months },
      };
    }
  }
}

/** A range the user typed: compared with the same number of days just before it. */
export function customPeriod(from: LocalDate, to: LocalDate): Period {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
  return {
    id: 'custom',
    from,
    to,
    previous: { from: addDays(from, -days), to: addDays(from, -1), kind: 'before' },
  };
}

/**
 * The period in the address (`?period=6m`, or `?period=custom&from=…&to=…`). Anything missing
 * or invalid falls back to the last 12 months, and `invalid` says so.
 */
export function periodFromSearch(
  search: URLSearchParams,
  today: LocalDate,
): { period: Period; invalid: boolean } {
  const id = search.get('period');
  if (id === 'custom') {
    try {
      const from = parseLocalDate(search.get('from') ?? '');
      const to = parseLocalDate(search.get('to') ?? '');
      if (from <= to && monthCount(from, to) <= MAX_MONTHS)
        return { period: customPeriod(from, to), invalid: false };
    } catch {
      // Falls through to the default.
    }
    return { period: presetPeriod('12m', today), invalid: true };
  }
  const preset = (PRESETS as readonly string[]).includes(id ?? '') ? (id as Preset) : '12m';
  return { period: presetPeriod(preset, today), invalid: false };
}
