import { FREQUENCIES, type Frequency, type LocalDate } from '@finanz/kernel';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField, TextField } from '../../components/Field';
import { Segmented } from '../../components/Segmented';
import { formatFullDate } from '../../lib/dates';
import { formattingLocale } from '../../lib/locale';
import { dayOfMonth, defaultSecondDay, upcomingDates } from './schedule';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
type Mode = 'auto' | 'confirm';

/** "15 de noviembre de 2026, 15 de diciembre de 2026 y 15 de enero de 2027". */
const listOf = (dates: LocalDate[]) =>
  new Intl.ListFormat(formattingLocale(), { type: 'conjunction' }).format(
    dates.map((d) => formatFullDate(d)),
  );

/**
 * The "Repetir" part of a new movement: how often, until when, and whether each time is recorded
 * on its own or waits for the user, with the next dates it will produce.
 */
export function RepeatFields({
  date,
  today,
  defaultOn,
  error,
}: {
  /** The movement's date: the first time it happens. */
  date: LocalDate;
  today: LocalDate;
  defaultOn: boolean;
  error: (key: 'endsOn' | 'secondDay') => string | undefined;
}) {
  const { t } = useTranslation();
  const [on, setOn] = useState(defaultOn);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [secondDay, setSecondDay] = useState<number | null>(null);
  const [endsOn, setEndsOn] = useState('');
  const [mode, setMode] = useState<Mode>('auto');
  const first = dayOfMonth(date);
  const second = secondDay ?? defaultSecondDay(first);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const upcoming = valid
    ? upcomingDates(
        { frequency, anchor: date, secondDay: frequency === 'twice_monthly' ? second : null },
        date,
        today,
        (endsOn || null) as LocalDate | null,
        3,
      )
    : [];

  return (
    <fieldset className="grid gap-5">
      <legend className="sr-only">{t('recurring.repeat.legend')}</legend>
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[14px] border border-line bg-hover px-4 py-3">
        <span>
          <span className="block font-semibold">{t('recurring.repeat.toggle')}</span>
          <span className="block text-muted text-sm">{t('recurring.repeat.toggleHint')}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={on}
          name="repeat"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative h-7 w-[2.875rem] shrink-0 rounded-full bg-line-strong transition-colors duration-150 after:absolute after:top-[3px] after:left-[3px] after:size-[1.375rem] after:rounded-full after:bg-surface after:transition-transform after:duration-150 peer-checked:bg-action peer-checked:after:translate-x-[1.125rem] peer-focus-visible:outline-2 peer-focus-visible:outline-brand peer-focus-visible:outline-offset-2"
        />
      </label>
      {on && (
        <>
          <Segmented
            legend={t('recurring.repeat.frequency')}
            name="frequency"
            value={frequency}
            onChange={setFrequency}
            options={FREQUENCIES.map((f) => ({ value: f, label: t(`recurring.frequency.${f}`) }))}
          />
          {frequency === 'twice_monthly' && (
            <SelectField
              label={t('recurring.repeat.secondDay')}
              name="secondDay"
              value={second}
              onChange={(e) => setSecondDay(Number(e.target.value))}
              hint={[
                t('recurring.repeat.secondDayHint', { day: first }),
                Math.max(first, second) > 28 ? t('recurring.repeat.monthEnd') : '',
              ]
                .filter(Boolean)
                .join(' ')}
              error={error('secondDay')}
            >
              {DAYS.map((d) => (
                <option key={d} value={d} disabled={d === first}>
                  {d}
                </option>
              ))}
            </SelectField>
          )}
          <TextField
            label={t('recurring.repeat.endsOn')}
            name="endsOn"
            type="date"
            value={endsOn}
            min={valid ? date : undefined}
            onChange={(e) => setEndsOn(e.target.value)}
            hint={t('recurring.repeat.endsOnHint')}
            error={error('endsOn')}
          />
          <div>
            <Segmented
              legend={t('recurring.repeat.mode')}
              name="mode"
              value={mode}
              onChange={setMode}
              options={(['auto', 'confirm'] as const).map((m) => ({
                value: m,
                label: t(`recurring.mode.${m}`),
              }))}
            />
            <p className="mt-1.5 text-sm text-subtle">{t(`recurring.repeat.modeHint.${mode}`)}</p>
          </div>
          {valid && (
            <div aria-live="polite" className="grid gap-1 rounded-lg bg-paper px-4 py-3 text-sm">
              {date <= today && <p>{t('recurring.repeat.firstNow')}</p>}
              <p>
                {upcoming.length > 0
                  ? t('recurring.repeat.upcoming', { dates: listOf(upcoming) })
                  : t('recurring.repeat.noMore')}
              </p>
              {date < today && <p className="text-subtle">{t('recurring.repeat.backdated')}</p>}
              {frequency === 'monthly' && first > 28 && (
                <p className="text-subtle">{t('recurring.repeat.monthEnd')}</p>
              )}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
