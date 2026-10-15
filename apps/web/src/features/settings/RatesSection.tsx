import type { UserRate } from '@finanz/contracts';
import { CURRENCY_CODES, todayIn } from '@finanz/kernel';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type ActionFunctionArgs, useFetcher } from 'react-router';
import { useAccount } from '../../app/account';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { SelectField, TextField } from '../../components/Field';
import { parseRateInput } from '../../lib/amount-input';
import { api, isApiFailure } from '../../lib/api';
import { formatLongDate } from '../../lib/dates';
import { describeFailure, type Failure } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';

export async function ratesLoader() {
  return { rates: await api<UserRate[]>('GET', '/currency/rates') };
}

interface RateResult {
  saved?: boolean;
  sameDay?: boolean;
  invalid?: boolean;
  failure?: Failure;
}

export async function ratesAction({ request }: ActionFunctionArgs): Promise<RateResult> {
  const form = await request.formData();
  const rate = parseRateInput(String(form.get('rate') ?? ''), formattingLocale());
  if (!rate) return { invalid: true };
  try {
    await api('POST', '/currency/rates', {
      base: form.get('base'),
      quote: form.get('quote'),
      validFrom: form.get('validFrom'),
      rate,
    });
  } catch (error) {
    if (isApiFailure(error, 409)) return { sameDay: true };
    return { failure: describeFailure(error) };
  }
  return { saved: true };
}

/** The user's exchange rates: how foreign accounts count in totals (Ajustes). */
export function RatesSection() {
  const { t } = useTranslation();
  const { preferences } = useAccount();
  const list = useFetcher<typeof ratesLoader>();
  const add = useFetcher<RateResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const others = CURRENCY_CODES.filter((c) => c !== preferences.primaryCurrency);

  useEffect(() => {
    if (list.state === 'idle' && !list.data) list.load('/settings/rates');
  }, [list]);
  useEffect(() => {
    if (add.state === 'idle' && add.data?.saved) {
      formRef.current?.reset();
      list.load('/settings/rates');
    }
  }, [add.state, add.data, list]);

  const rates = list.data?.rates ?? [];
  return (
    <div className="grid gap-5 text-ink">
      <p className="text-muted text-sm">
        {t('settings.ratesHint', { currency: preferences.primaryCurrency })}
      </p>
      {rates.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rates.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm"
            >
              <span className="font-medium">
                1 {r.base} = {r.rate} {r.quote}
              </span>
              <span className="text-subtle">
                {t('settings.rateFrom', { date: formatLongDate(r.validFrom) })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <add.Form
        method="post"
        action="/settings/rates"
        ref={formRef}
        className="grid max-w-md gap-4 sm:grid-cols-2"
      >
        <input type="hidden" name="quote" value={preferences.primaryCurrency} />
        <SelectField label={t('settings.rateCurrency')} name="base" defaultValue={others[0]}>
          {others.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('settings.rateValue', { currency: preferences.primaryCurrency })}
          name="rate"
          inputMode="decimal"
          error={add.data?.invalid ? t('settings.rateInvalid') : undefined}
        />
        <TextField
          label={t('settings.rateValidFrom')}
          name="validFrom"
          type="date"
          defaultValue={todayIn(preferences.timeZone)}
        />
        <div className="flex items-end">
          <Button type="submit" variant="secondary" pending={add.state !== 'idle'}>
            {t('settings.rateAdd')}
          </Button>
        </div>
      </add.Form>
      {add.data?.sameDay && <p className="text-expense text-sm">{t('settings.rateSameDay')}</p>}
      <FailureNotice failure={add.data?.failure} />
    </div>
  );
}
