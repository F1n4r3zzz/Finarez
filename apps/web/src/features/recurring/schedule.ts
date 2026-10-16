import type { AccountView, RecurringTemplate, RuleView } from '@finanz/contracts';
import {
  type CurrencyCode,
  type Frequency,
  type LocalDate,
  type Money,
  money,
  nextOccurrence,
  occurrencesFrom,
  parseLocalDate,
  type Schedule,
} from '@finanz/kernel';
import { useTranslation } from 'react-i18next';
import { formattingLocale } from '../../lib/locale';

const utc = (date: LocalDate) => new Date(`${date}T00:00:00Z`);
export const dayOfMonth = (date: LocalDate) => Number(date.slice(8, 10));

export function addDays(date: LocalDate, days: number): LocalDate {
  const t = utc(date);
  t.setUTCDate(t.getUTCDate() + days);
  return parseLocalDate(t.toISOString().slice(0, 10));
}

/** The usual other payday: half a month away from the first (15 → 30, 20 → 5). */
export const defaultSecondDay = (first: number) => (first <= 15 ? first + 15 : first - 15);

const lastDayOfMonth = (date: LocalDate) => {
  const [year, month] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

/**
 * Twice a month, seen from the next date: the rule's other day of the month. The next date
 * falls on either of its two days (a 31 shows as the month's last day).
 */
export function otherDay(rule: Pick<RuleView, 'anchorOn' | 'secondDay' | 'nextDueOn'>) {
  if (rule.secondDay === null) return null;
  const next = dayOfMonth(rule.nextDueOn);
  const onSecond =
    next === rule.secondDay || (rule.secondDay > next && next === lastDayOfMonth(rule.nextDueOn));
  return onSecond ? dayOfMonth(rule.anchorOn) : rule.secondDay;
}

/**
 * The dates a new rule will record after its first movement: when that movement is dated today
 * or earlier it is recorded now and the rule goes on after today, otherwise it starts on it.
 */
export function upcomingDates(
  schedule: Schedule,
  first: LocalDate,
  today: LocalDate,
  endsOn: LocalDate | null,
  count: number,
): LocalDate[] {
  const from = first <= today ? nextOccurrence(schedule, today) : first;
  return occurrencesFrom(schedule, from, count).filter((d) => !endsOn || d <= endsOn);
}

/** A rule's next dates, from the one it is waiting for, up to its last day. */
export function nextDates(rule: RuleView, count: number): LocalDate[] {
  if (rule.ended) return [];
  return occurrencesFrom(
    { frequency: rule.frequency, anchor: rule.anchorOn, secondDay: rule.secondDay },
    rule.nextDueOn,
    count,
  ).filter((d) => !rule.endsOn || d <= rule.endsOn);
}

/** "Cada mes, el día 15", "Cada lunes", "Cada año, el 3 de marzo"… */
export function useDescribeSchedule() {
  const { t } = useTranslation();
  return (schedule: { frequency: Frequency; anchorOn: LocalDate; secondDay: number | null }) => {
    const day = dayOfMonth(schedule.anchorOn);
    switch (schedule.frequency) {
      case 'monthly':
        return t('recurring.schedule.monthly', { day });
      case 'twice_monthly': {
        const other = schedule.secondDay ?? day;
        return t('recurring.schedule.twice_monthly', {
          first: Math.min(day, other),
          second: Math.max(day, other),
        });
      }
      case 'weekly':
        return t('recurring.schedule.weekly', {
          weekday: new Intl.DateTimeFormat(formattingLocale(), {
            weekday: 'long',
            timeZone: 'UTC',
          }).format(utc(schedule.anchorOn)),
        });
      case 'yearly':
        return t('recurring.schedule.yearly', {
          date: new Intl.DateTimeFormat(formattingLocale(), {
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC',
          }).format(utc(schedule.anchorOn)),
        });
    }
  };
}

/**
 * What one occurrence moves, in the rule's currency: income positive, expenses negative (a
 * refund line counts against them), a transfer as the amount sent.
 */
export function templateAmount(template: RecurringTemplate, currency: CurrencyCode): Money {
  if (template.kind === 'transfer') return money(BigInt(template.from.amountMinor), currency);
  const total = template.lines.reduce((sum, l) => sum + BigInt(l.amountMinor), 0n);
  return money(template.kind === 'expense' ? -total : total, currency);
}

/** "Bancolombia" or "Bancolombia → Nequi", for the line under a rule's name. */
export function templateAccounts(
  template: RecurringTemplate,
  accounts: ReadonlyMap<string, AccountView>,
): string {
  const name = (id: string) => accounts.get(id)?.name ?? '';
  return template.kind === 'transfer'
    ? `${name(template.from.accountId)} → ${name(template.to.accountId)}`
    : name(template.accountId);
}
