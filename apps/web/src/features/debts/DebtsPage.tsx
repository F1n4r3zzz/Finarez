import type { DebtInput, DebtView } from '@finanz/contracts';
import {
  type CurrencyCode,
  fromWire,
  type LocalDate,
  type Money,
  money,
  todayIn,
} from '@finanz/kernel';
import { Plus } from 'lucide-react';
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
import { useAccount } from '../../app/account';
import { moduleById } from '../../app/modules';
import { ActionLink } from '../../components/ActionLink';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FailureNotice } from '../../components/FailureNotice';
import { SelectField, TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Segmented } from '../../components/Segmented';
import { formatLongDate } from '../../lib/dates';
import { describeFailure, type Failure } from '../../lib/failure';
import { formatMoney } from '../../lib/money';
import { formatPercent } from '../../lib/percent';
import { NotFoundPage } from '../errors/NotFoundPage';
import { currencyOptions } from '../preferences/options';
import { createDebt, listDebts, updateDebt } from './api';
import {
  type DebtType,
  type FieldErrors,
  formReader,
  readTerms,
  type TermsFieldKey,
  TermsFields,
} from './TermsFields';

export async function debtsLoader() {
  return { debts: await listDebts() };
}

const owedOf = (d: DebtView) => fromWire({ amountMinor: d.outstandingMinor, currency: d.currency });

/** `part / whole` as a ratio between 0 and 1, computed in integers. */
function share(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  const clamped = part < 0n ? 0n : part > whole ? whole : part;
  return Number((clamped * 10_000n) / whole) / 10_000;
}

/** How far along a debt is: paid off (loans) or credit used (cards). */
function progressOf(d: DebtView): { ratio: number; kind: 'paid' | 'used'; of: Money } | undefined {
  const owed = BigInt(d.outstandingMinor);
  if (d.type === 'loan' && d.originalPrincipalMinor) {
    const original = BigInt(d.originalPrincipalMinor);
    return {
      ratio: share(original - owed, original),
      kind: 'paid',
      of: money(original, d.currency),
    };
  }
  if (d.type === 'credit_card' && d.creditLimitMinor) {
    const limit = BigInt(d.creditLimitMinor);
    return { ratio: share(owed, limit), kind: 'used', of: money(limit, d.currency) };
  }
  return undefined;
}

function totalsByCurrency(debts: readonly DebtView[]): Money[] {
  const totals = new Map<CurrencyCode, bigint>();
  for (const d of debts)
    totals.set(d.currency, (totals.get(d.currency) ?? 0n) + BigInt(d.outstandingMinor));
  return [...totals].map(([currency, amount]) => money(amount, currency));
}

function DebtCard({ debt }: { debt: DebtView }) {
  const { t } = useTranslation();
  const progress = progressOf(debt);
  const details = [
    debt.nextDueOn ? t('debts.nextDue', { date: formatLongDate(debt.nextDueOn) }) : undefined,
    debt.installmentMinor
      ? t('debts.installment', {
          amount: formatMoney(
            fromWire({ amountMinor: debt.installmentMinor, currency: debt.currency }),
          ),
        })
      : undefined,
  ].filter(Boolean);
  return (
    <Link
      to={`/debts/${debt.id}`}
      className="block h-full rounded-xl border border-line bg-surface p-5 transition-colors duration-150 hover:bg-hover"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="line-clamp-2 font-semibold">{debt.name}</span>
          <span className="block text-sm text-subtle">{t(`debts.types.${debt.type}`)}</span>
        </span>
        <span className="text-right">
          <span className="block text-sm text-muted">{t('debts.owed')}</span>
          <Amount value={owedOf(debt)} className="text-lg" />
        </span>
      </div>
      {progress && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div
              className={`h-full rounded-full ${progress.kind === 'paid' ? 'bg-income' : 'bg-brand'}`}
              style={{ width: `${progress.ratio * 100}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            {t(progress.kind === 'paid' ? 'debts.paidShare' : 'debts.usedShare', {
              share: formatPercent(progress.ratio, { signed: false }),
              amount: formatMoney(progress.of),
            })}
          </p>
        </div>
      )}
      {details.length > 0 && <p className="mt-3 text-sm text-subtle">{details.join('. ')}</p>}
    </Link>
  );
}

const ADD_LINK =
  'inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 font-medium text-on-brand transition-colors duration-150 hover:bg-brand/90';

export function DebtsPage() {
  const { t } = useTranslation();
  const { debts } = useLoaderData<typeof debtsLoader>();
  const open = debts.filter((d) => !d.archived);

  return (
    <>
      <PageHeader
        title={t('modules.debts.title')}
        description={t('modules.debts.description')}
        action={open.length > 0 && <ActionLink to="/debts/new" label={t('debts.add')} />}
      />
      {open.length === 0 ? (
        <EmptyState
          icon={moduleById('debts').icon}
          title={t('debts.emptyTitle')}
          body={t('debts.emptyBody')}
        >
          <Link to="/debts/new" className={`mt-6 ${ADD_LINK}`}>
            <Plus size={18} aria-hidden="true" />
            {t('debts.add')}
          </Link>
        </EmptyState>
      ) : (
        <>
          <dl className="mb-6 flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="text-sm text-muted">{t('debts.total')}</dt>
              {totalsByCurrency(open).map((total) => (
                <dd key={total.currency} className="mt-1 text-2xl">
                  <Amount value={total} />
                </dd>
              ))}
            </div>
          </dl>
          <ul className="grid gap-4 md:grid-cols-2">
            {open.map((d) => (
              <li key={d.id}>
                <DebtCard debt={d} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

type NewFieldKey = 'name' | 'owed' | TermsFieldKey;

interface FormResult<K extends string> {
  fieldErrors?: FieldErrors<K>;
  failure?: Failure;
}

export async function newDebtAction({
  request,
}: ActionFunctionArgs): Promise<FormResult<NewFieldKey> | Response> {
  const form = await request.formData();
  const errors: FieldErrors<NewFieldKey> = {};
  const currency = String(form.get('currency') ?? '') as CurrencyCode;
  const read = formReader<NewFieldKey>(form, currency, errors);
  const type = read.field('type') === 'credit_card' ? 'credit_card' : 'loan';
  const name = read.field('name');
  if (!name) errors.name = 'required';
  const input: DebtInput = {
    name,
    type,
    currency,
    openedOn: read.field('openedOn') as LocalDate,
    outstandingMinor: read.amount('owed', { required: true, zeroOk: true }) ?? '0',
    ...readTerms(form, type, currency, errors),
  };
  if (Object.keys(errors).length) return { fieldErrors: errors };

  let created: DebtView;
  try {
    created = await createDebt(input, read.field('idempotencyKey'));
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return redirect(`/debts/${created.id}`);
}

const useSubmitting = () => {
  const navigation = useNavigation();
  return navigation.state !== 'idle' && navigation.formMethod === 'POST';
};

export function NewDebtPage() {
  const { t, i18n } = useTranslation();
  const { preferences } = useAccount();
  const result = useActionData<FormResult<NewFieldKey>>();
  const submitting = useSubmitting();
  const [type, setType] = useState<DebtType>('loan');
  // One key per form: pressing "Agregar deuda" twice creates one debt.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const error = (key: NewFieldKey) => {
    const code = result?.fieldErrors?.[key];
    return code ? t(`debts.fields.${code}`) : undefined;
  };
  const loan = type === 'loan';

  return (
    <>
      <PageHeader title={t('debts.form.title')} description={t('debts.emptyBody')} />
      <Form method="post" noValidate className="grid max-w-lg gap-5">
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <Segmented
          legend={t('debts.form.type')}
          name="type"
          options={(['loan', 'credit_card'] as const).map((v) => ({
            value: v,
            label: t(`debts.types.${v}`),
          }))}
          value={type}
          onChange={setType}
        />
        <TextField
          label={t('debts.form.name')}
          name="name"
          hint={t(loan ? 'debts.form.nameHint' : 'debts.form.cardNameHint')}
          error={error('name')}
          autoComplete="off"
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label={t('debts.form.currency')}
            name="currency"
            defaultValue={preferences.primaryCurrency}
          >
            {currencyOptions(i18n.resolvedLanguage ?? 'es').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('debts.form.openedOn')}
            name="openedOn"
            type="date"
            defaultValue={todayIn(preferences.timeZone)}
          />
        </div>
        <TextField
          label={t('debts.form.owed')}
          name="owed"
          inputMode="decimal"
          hint={t(loan ? 'debts.form.owedHint' : 'debts.form.cardOwedHint')}
          error={error('owed')}
        />
        <TermsFields type={type} errors={result?.fieldErrors} />
        <FailureNotice failure={result?.failure} />
        <div>
          <Button type="submit" pending={submitting}>
            {t(submitting ? 'debts.form.submitting' : 'debts.form.submit')}
          </Button>
        </div>
      </Form>
    </>
  );
}

export async function editDebtLoader({ params }: LoaderFunctionArgs) {
  return { debt: (await listDebts()).find((d) => d.id === params.id) };
}

export async function editDebtAction({
  request,
  params,
}: ActionFunctionArgs): Promise<FormResult<TermsFieldKey> | Response> {
  const id = params.id ?? '';
  const debt = (await listDebts()).find((d) => d.id === id);
  if (!debt) return { failure: { key: 'unexpected' } };
  const errors: FieldErrors<TermsFieldKey> = {};
  const terms = readTerms(await request.formData(), debt.type, debt.currency, errors);
  if (Object.keys(errors).length) return { fieldErrors: errors };
  try {
    await updateDebt(id, terms);
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return redirect(`/debts/${id}`);
}

/** Changes the rate, installment, term or days of a debt; past payments keep their split. */
export function EditDebtPage() {
  const { t } = useTranslation();
  const { debt } = useLoaderData<typeof editDebtLoader>();
  const result = useActionData<FormResult<TermsFieldKey>>();
  const submitting = useSubmitting();
  if (!debt) return <NotFoundPage />;

  return (
    <>
      <PageHeader title={t('debts.edit.title')} description={debt.name} />
      <Form method="post" noValidate className="grid max-w-lg gap-5">
        <p className="text-muted text-sm">{t('debts.edit.hint')}</p>
        <TermsFields type={debt.type} debt={debt} errors={result?.fieldErrors} />
        <FailureNotice failure={result?.failure} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" pending={submitting}>
            {t(submitting ? 'debts.edit.submitting' : 'debts.edit.submit')}
          </Button>
          <Link
            to={`/debts/${debt.id}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 font-medium transition-colors duration-150 hover:bg-hover"
          >
            {t('debts.edit.cancel')}
          </Link>
        </div>
      </Form>
    </>
  );
}
