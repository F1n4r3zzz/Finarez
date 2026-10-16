import type { RuleUpdate, RuleView } from '@finanz/contracts';
import { FREQUENCIES, type Frequency, type LocalDate, money } from '@finanz/kernel';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Form,
  Link,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { SelectField, TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Segmented } from '../../components/Segmented';
import { formatAmountInput, parseAmountInput } from '../../lib/amount-input';
import { isApiFailure } from '../../lib/api';
import { describeFailure, type Failure } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';
import { NotFoundPage } from '../errors/NotFoundPage';
import { getRule, updateRule } from './api';
import { dayOfMonth, defaultSecondDay, otherDay } from './schedule';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
type Mode = 'auto' | 'confirm';
type FieldKey = 'description' | 'amount' | 'secondDay' | 'endsOn';
interface FormResult {
  fieldErrors?: Partial<
    Record<FieldKey, 'required' | 'amountInvalid' | 'secondDaySame' | 'endsBeforeNext'>
  >;
  failure?: Failure;
}

export async function editRuleLoader({ params }: LoaderFunctionArgs) {
  try {
    const rule = await getRule(params.id ?? '');
    return { rule: rule.ended ? undefined : rule };
  } catch (error) {
    if (isApiFailure(error, 404)) return { rule: undefined };
    throw error;
  }
}

/** The amount a single-amount rule moves, without sign. */
const usualAmount = (rule: RuleView) => {
  if (rule.amountMinor === null) return null;
  const value = BigInt(rule.amountMinor);
  return value < 0n ? -value : value;
};

/** Sends only what changed; a new schedule or next date restarts the calendar from that date. */
export async function editRuleAction({
  request,
  params,
}: ActionFunctionArgs): Promise<FormResult | Response> {
  const id = params.id ?? '';
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const rule = await getRule(id);
  const errors: FormResult['fieldErrors'] = {};
  const change: RuleUpdate = {};

  const description = field('description');
  if (!description) errors.description = 'required';
  else if (description !== rule.template.description) change.description = description;

  const usual = usualAmount(rule);
  if (usual !== null) {
    const text = field('amount');
    try {
      if (!text) throw new Error('empty');
      const value = parseAmountInput(text, rule.currency, formattingLocale()).amountMinor;
      if (value <= 0n) throw new Error('not positive');
      if (value !== usual) change.amountMinor = value.toString();
    } catch {
      errors.amount = text ? 'amountInvalid' : 'required';
    }
  }

  const frequency = field('frequency') as Frequency;
  const next = field('nextDueOn') as LocalDate;
  const secondDay = frequency === 'twice_monthly' ? Number(field('secondDay')) : null;
  if (secondDay !== null && secondDay === dayOfMonth(next)) errors.secondDay = 'secondDaySame';
  if (frequency !== rule.frequency || secondDay !== otherDay(rule) || next !== rule.nextDueOn) {
    change.frequency = frequency;
    change.secondDay = secondDay;
    change.nextDueOn = next;
  }

  const endsOn = (field('endsOn') || null) as LocalDate | null;
  if (endsOn && endsOn < next) errors.endsOn = 'endsBeforeNext';
  if (endsOn !== rule.endsOn) change.endsOn = endsOn;
  const confirm = field('mode') === 'confirm';
  if (confirm !== rule.confirm) change.confirm = confirm;

  if (Object.keys(errors).length) return { fieldErrors: errors };
  if (Object.keys(change).length > 0) {
    try {
      await updateRule(id, change);
    } catch (error) {
      return { failure: describeFailure(error) };
    }
  }
  return redirect(`/transactions/recurring/${id}`);
}

function RuleForm({ rule }: { rule: RuleView }) {
  const { t } = useTranslation();
  const result = useActionData<FormResult>();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const [frequency, setFrequency] = useState<Frequency>(rule.frequency);
  const [next, setNext] = useState<string>(rule.nextDueOn);
  const [secondDay, setSecondDay] = useState<number | null>(otherDay(rule));
  const [mode, setMode] = useState<Mode>(rule.confirm ? 'confirm' : 'auto');
  const first = dayOfMonth(next as LocalDate);
  const second = secondDay ?? defaultSecondDay(first);
  const usual = usualAmount(rule);
  const error = (key: FieldKey) => {
    const code = result?.fieldErrors?.[key];
    return code ? t(`recurring.fields.${code}`) : undefined;
  };

  return (
    <Form method="post" noValidate className="grid max-w-lg gap-5">
      <TextField
        label={t('ledger.transactions.form.description')}
        name="description"
        defaultValue={rule.template.description}
        error={error('description')}
        autoComplete="off"
      />
      {usual !== null ? (
        <TextField
          label={t('ledger.transactions.form.amount')}
          name="amount"
          inputMode="decimal"
          defaultValue={formatAmountInput(money(usual, rule.currency), formattingLocale())}
          hint={t('recurring.form.amountHint', { currency: rule.currency })}
          error={error('amount')}
        />
      ) : (
        <p className="text-sm text-subtle">{t('recurring.form.amountFixed')}</p>
      )}
      <Segmented
        legend={t('recurring.repeat.frequency')}
        name="frequency"
        value={frequency}
        onChange={setFrequency}
        options={FREQUENCIES.map((f) => ({ value: f, label: t(`recurring.frequency.${f}`) }))}
      />
      <TextField
        label={t('recurring.form.next')}
        name="nextDueOn"
        type="date"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        hint={t('recurring.form.nextHint')}
      />
      {frequency === 'twice_monthly' && (
        <SelectField
          label={t('recurring.repeat.secondDay')}
          name="secondDay"
          value={second}
          onChange={(e) => setSecondDay(Number(e.target.value))}
          hint={t('recurring.form.secondDayHint', { day: first })}
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
        defaultValue={rule.endsOn ?? ''}
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
      <p className="text-sm text-subtle">{t('recurring.form.fixed')}</p>
      <FailureNotice failure={result?.failure} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={submitting}>
          {t(submitting ? 'recurring.form.saving' : 'recurring.form.save')}
        </Button>
        <Link
          to={`/transactions/recurring/${rule.id}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 font-medium transition-colors duration-150 hover:bg-hover"
        >
          {t('recurring.form.cancel')}
        </Link>
      </div>
    </Form>
  );
}

export function EditRulePage() {
  const { t } = useTranslation();
  const { rule } = useLoaderData<typeof editRuleLoader>();
  if (!rule) return <NotFoundPage />;
  return (
    <>
      <PageHeader title={t('recurring.form.title')} description={rule.template.description} />
      <RuleForm rule={rule} />
    </>
  );
}
