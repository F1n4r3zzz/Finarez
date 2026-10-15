import { ASSET_SUBTYPES, type DebtView, type PaymentView } from '@finanz/contracts';
import { fromWire, type LocalDate, todayIn } from '@finanz/kernel';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Link,
  type LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
} from 'react-router';
import { useAccount } from '../../app/account';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { SelectField, TextField } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { fractionToPercent, parseAmountInput } from '../../lib/amount-input';
import { formatLongDate, formatMediumDate } from '../../lib/dates';
import { describeFailure, type Failure } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';
import { formatMoney } from '../../lib/money';
import { NotFoundPage } from '../errors/NotFoundPage';
import { listAccounts } from '../ledger/api';
import {
  getProposal,
  getSchedule,
  listDebts,
  listPayments,
  recordPayment,
  voidPayment,
} from './api';

export async function debtLoader({ params }: LoaderFunctionArgs) {
  const id = params.id ?? '';
  const debt = (await listDebts()).find((d) => d.id === id);
  if (!debt) return { debt: undefined };
  const [accounts, payments, schedule] = await Promise.all([
    listAccounts(),
    listPayments(id),
    getSchedule(id),
  ]);
  return { debt, accounts, payments, schedule };
}

/** The split the API proposes for a payment typed in the form (a resource route). */
export async function proposalLoader({ params, request }: LoaderFunctionArgs) {
  const query = new URL(request.url).searchParams;
  return getProposal(params.id ?? '', query.get('amountMinor') ?? '', query.get('paidOn') ?? '');
}

type FieldKey = 'amount' | 'interest' | 'fees' | 'fromAccountId';
interface PayResult {
  paid?: boolean;
  voided?: boolean;
  fieldErrors?: Partial<Record<FieldKey, 'required' | 'amountInvalid'>>;
  failure?: Failure;
}

export async function debtAction({ request, params }: ActionFunctionArgs): Promise<PayResult> {
  const id = params.id ?? '';
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '').trim();
  if (field('intent') === 'void') {
    try {
      await voidPayment(id, field('transactionId'), Number(field('version')));
    } catch (error) {
      return { failure: describeFailure(error) };
    }
    return { voided: true };
  }

  const currency = (await listDebts()).find((d) => d.id === id)?.currency;
  const errors: PayResult['fieldErrors'] = {};
  const amount = (name: FieldKey, required: boolean) => {
    const text = field(name);
    if (!text) {
      if (required) errors[name] = 'required';
      return undefined;
    }
    try {
      if (!currency) throw new Error('no debt');
      const value = parseAmountInput(text, currency, formattingLocale()).amountMinor;
      if (value < 0n || (value === 0n && required)) throw new Error('not positive');
      return value.toString();
    } catch {
      errors[name] = 'amountInvalid';
      return undefined;
    }
  };
  const fromAccountId = field('fromAccountId');
  if (!fromAccountId) errors.fromAccountId = 'required';
  const amountMinor = amount('amount', true);
  // Without "otro desglose" the API applies the split it proposed.
  const custom = field('custom') === 'on';
  const interestMinor = custom ? (amount('interest', false) ?? '0') : undefined;
  const feesMinor = custom ? (amount('fees', false) ?? '0') : undefined;
  if (Object.keys(errors).length || !amountMinor) return { fieldErrors: errors };

  try {
    await recordPayment(
      id,
      {
        fromAccountId,
        paidOn: field('paidOn') as LocalDate,
        amountMinor,
        ...(interestMinor === undefined ? {} : { interestMinor }),
        ...(feesMinor === undefined || feesMinor === '0' ? {} : { feesMinor }),
      },
      field('idempotencyKey'),
    );
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return { paid: true };
}

type Loaded = Extract<Awaited<ReturnType<typeof debtLoader>>, { accounts: unknown }>;

function Terms({ debt }: { debt: DebtView }) {
  const { t } = useTranslation();
  const show = (minor: string | null) =>
    minor ? formatMoney(fromWire({ amountMinor: minor, currency: debt.currency })) : undefined;
  const rows: [string, string | undefined][] = [
    [
      t('debts.detail.rateLabel'),
      debt.rate
        ? t('debts.detail.rate', {
            rate: fractionToPercent(debt.rate, formattingLocale()),
            period: t(
              debt.ratePeriod === 'annual' ? 'debts.detail.annual' : 'debts.detail.monthly',
            ),
          })
        : t('debts.detail.noRate'),
    ],
    [t('debts.form.installment'), show(debt.installmentMinor)],
    [t('debts.form.limit'), show(debt.creditLimitMinor)],
    [t('debts.detail.original'), show(debt.originalPrincipalMinor)],
    [
      t('debts.detail.term'),
      debt.termMonths ? t('debts.detail.months', { count: debt.termMonths }) : undefined,
    ],
    [t('debts.form.statementDay'), debt.statementDay?.toString()],
    [t('debts.form.dueDay'), debt.dueDay?.toString()],
  ];
  return (
    <Panel
      title={t('debts.detail.terms')}
      link={{ to: `/debts/${debt.id}/edit`, label: t('debts.detail.edit') }}
    >
      <dl className="grid gap-2 text-sm">
        {rows
          .filter((r): r is [string, string] => Boolean(r[1]))
          .map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted">{label}</dt>
              <dd className="amount text-right">{value}</dd>
            </div>
          ))}
      </dl>
    </Panel>
  );
}

function PaymentForm({ debt, accounts }: Pick<Loaded, 'debt' | 'accounts'>) {
  const { t } = useTranslation();
  const { preferences } = useAccount();
  const pay = useFetcher<PayResult>();
  const proposal = useFetcher<typeof proposalLoader>();
  const formRef = useRef<HTMLFormElement>(null);
  const [amountText, setAmountText] = useState('');
  const [paidOn, setPaidOn] = useState<string>(todayIn(preferences.timeZone));
  const [custom, setCustom] = useState(false);
  // A new key after each payment; the same key while one is being sent.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const sources = accounts.filter(
    (a) =>
      !a.archived &&
      a.currency === debt.currency &&
      (ASSET_SUBTYPES as readonly string[]).includes(a.subtype),
  );

  // Ask for the split a moment after typing stops.
  const load = proposal.load;
  useEffect(() => {
    let minor: bigint | undefined;
    try {
      minor = parseAmountInput(amountText, debt.currency, formattingLocale()).amountMinor;
    } catch {
      minor = undefined;
    }
    if (!minor || minor <= 0n || !paidOn) return;
    const timer = setTimeout(
      () => load(`/debts/${debt.id}/proposal?amountMinor=${minor}&paidOn=${paidOn}`),
      300,
    );
    return () => clearTimeout(timer);
  }, [amountText, paidOn, debt.id, debt.currency, load]);

  useEffect(() => {
    if (pay.state === 'idle' && pay.data?.paid) {
      formRef.current?.reset();
      setAmountText('');
      setCustom(false);
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [pay.state, pay.data]);

  const error = (key: FieldKey) => {
    const code = pay.data?.fieldErrors?.[key];
    return code ? t(`debts.fields.${code}`) : undefined;
  };
  const money = (minor: string) =>
    formatMoney(fromWire({ amountMinor: minor, currency: debt.currency }));
  const split = amountText && proposal.data ? proposal.data : undefined;

  if (sources.length === 0) {
    return (
      <Panel title={t('debts.detail.payTitle')}>
        <p className="text-muted text-sm">
          {t('debts.detail.noSource', { currency: debt.currency })}
        </p>
        <Link
          to="/accounts/new"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 font-medium transition-colors duration-150 hover:bg-hover"
        >
          <Plus size={18} aria-hidden="true" />
          {t('ledger.accounts.add')}
        </Link>
      </Panel>
    );
  }

  return (
    <Panel title={t('debts.detail.payTitle')}>
      <pay.Form method="post" ref={formRef} noValidate className="grid gap-5">
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <SelectField
          label={t('debts.detail.from')}
          name="fromAccountId"
          error={error('fromAccountId')}
        >
          {sources.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label={t('debts.detail.paidOn')}
            name="paidOn"
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
          <TextField
            label={t('debts.detail.amount')}
            name="amount"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            error={error('amount')}
          />
        </div>
        {split && !custom && (
          <p className="text-muted text-sm" aria-live="polite">
            {BigInt(split.interestMinor) > 0n
              ? t('debts.detail.proposal', {
                  interest: money(split.interestMinor),
                  principal: money(split.principalMinor),
                })
              : t('debts.detail.proposalNoInterest', { principal: money(split.principalMinor) })}
          </p>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="custom"
            checked={custom}
            onChange={(e) => setCustom(e.target.checked)}
            className="size-5 accent-brand"
          />
          {t('debts.detail.override')}
        </label>
        {custom && (
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label={t('debts.detail.interest')}
              name="interest"
              inputMode="decimal"
              defaultValue=""
              hint={t('debts.detail.interestHint')}
              error={error('interest')}
            />
            <TextField
              label={t('debts.detail.fees')}
              name="fees"
              inputMode="decimal"
              defaultValue=""
              error={error('fees')}
            />
          </div>
        )}
        <FailureNotice failure={pay.data?.failure} />
        {pay.state === 'idle' && pay.data?.paid && (
          <Notice tone="success">{t('debts.detail.paid')}</Notice>
        )}
        <div>
          <Button type="submit" pending={pay.state !== 'idle'}>
            {t(pay.state !== 'idle' ? 'debts.detail.submitting' : 'debts.detail.submit')}
          </Button>
        </div>
      </pay.Form>
    </Panel>
  );
}

function PaymentRow({ debt, payment }: { debt: DebtView; payment: PaymentView }) {
  const { t } = useTranslation();
  const voider = useFetcher<PayResult>();
  const [confirming, setConfirming] = useState(false);
  const money = (minor: string) =>
    formatMoney(fromWire({ amountMinor: minor, currency: debt.currency }));
  const isVoid = payment.status === 'void';
  const parts = [
    t('debts.detail.splitPrincipal', { amount: money(payment.principalMinor) }),
    BigInt(payment.interestMinor) > 0n
      ? t('debts.detail.splitInterest', { amount: money(payment.interestMinor) })
      : undefined,
    BigInt(payment.feesMinor) > 0n
      ? t('debts.detail.splitFees', { amount: money(payment.feesMinor) })
      : undefined,
  ].filter(Boolean);

  return (
    <li className={`grid gap-1 pt-3 ${isVoid ? 'pb-3 opacity-60' : 'pb-1'}`}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0">
          <span className="block font-medium">{formatLongDate(payment.paidOn)}</span>
          <span className="block text-sm text-subtle">
            {isVoid ? t('debts.detail.voided') : parts.join(', ')}
          </span>
        </span>
        <Amount
          value={fromWire({ amountMinor: payment.amountMinor, currency: debt.currency })}
          className={isVoid ? 'line-through' : ''}
        />
      </div>
      {!isVoid && (
        <voider.Form method="post" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="intent" value="void" />
          <input type="hidden" name="transactionId" value={payment.transactionId} />
          <input type="hidden" name="version" value={payment.version} />
          {confirming ? (
            <>
              <span className="text-sm">{t('debts.detail.confirmVoid')}</span>
              <Button type="submit" variant="secondary" pending={voider.state !== 'idle'}>
                {t('debts.detail.void')}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t('debts.detail.keep')}
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-muted text-sm transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              {t('debts.detail.void')}
            </button>
          )}
        </voider.Form>
      )}
      <FailureNotice failure={voider.data?.failure} />
    </li>
  );
}

const PREVIEW_ROWS = 12;

function Schedule({ debt, schedule }: Pick<Loaded, 'debt' | 'schedule'>) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const money = (minor: string) =>
    formatMoney(fromWire({ amountMinor: minor, currency: debt.currency }));
  const last = schedule.rows.at(-1);
  const regular = BigInt(schedule.rows[0]?.installmentMinor ?? '0');
  // A last installment well above the others means the balance, installment and term disagree.
  const balloon =
    last && schedule.rows.length > 1 && BigInt(last.installmentMinor) * 10n > regular * 11n
      ? last
      : undefined;
  const shown = all ? schedule.rows : schedule.rows.slice(0, PREVIEW_ROWS);
  if (schedule.rows.length === 0 && !schedule.neverEnds) return null;

  return (
    <Panel title={t('debts.detail.schedule')}>
      {schedule.neverEnds ? (
        <Notice tone="error">{t('debts.detail.neverEnds')}</Notice>
      ) : (
        last && (
          <p className="text-muted text-sm">
            {t('debts.detail.scheduleEnds', {
              date: formatLongDate(last.dueOn),
              count: schedule.rows.length,
            })}
          </p>
        )
      )}
      {balloon && (
        <Notice tone="info" className="mt-3">
          {t('debts.detail.lastInstallment', { amount: money(balloon.installmentMinor) })}
        </Notice>
      )}
      {shown.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-line border-b text-left text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                {t('debts.detail.due')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t('debts.detail.installmentCol')}
              </th>
              <th scope="col" className="hidden py-2 pr-3 text-right font-medium sm:table-cell">
                {t('debts.detail.interest')}
              </th>
              <th scope="col" className="hidden py-2 pr-3 text-right font-medium sm:table-cell">
                {t('debts.detail.principal')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('debts.detail.left')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <tr key={r.dueOn}>
                <td className="py-2 pr-3 whitespace-nowrap">{formatMediumDate(r.dueOn)}</td>
                <td className="amount py-2 pr-3 text-right">{money(r.installmentMinor)}</td>
                <td className="amount hidden py-2 pr-3 text-right text-muted sm:table-cell">
                  {money(r.interestMinor)}
                </td>
                <td className="amount hidden py-2 pr-3 text-right text-muted sm:table-cell">
                  {money(r.principalMinor)}
                </td>
                <td className="amount py-2 text-right">{money(r.balanceAfterMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {schedule.rows.length > PREVIEW_ROWS && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          aria-expanded={all}
          className="mt-3 -ml-2 inline-flex min-h-11 items-center rounded-md px-2 font-medium text-brand text-sm transition-colors duration-150 hover:bg-brand-soft"
        >
          {all
            ? t('debts.detail.showFewer')
            : t('debts.detail.showAll', { count: schedule.rows.length })}
        </button>
      )}
    </Panel>
  );
}

export function DebtPage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof debtLoader>();
  if (!data.debt) return <NotFoundPage />;
  const { debt, accounts, payments, schedule } = data as Loaded;
  const owed = fromWire({ amountMinor: debt.outstandingMinor, currency: debt.currency });

  return (
    <>
      <PageHeader title={debt.name} description={t(`debts.types.${debt.type}`)} />
      <dl className="mb-6 flex flex-wrap gap-x-10 gap-y-4">
        <div>
          <dt className="text-sm text-muted">{t('debts.owed')}</dt>
          <dd className="mt-1 text-2xl md:text-3xl">
            <Amount value={owed} />
          </dd>
        </div>
        {debt.nextDueOn && (
          <div>
            <dt className="text-sm text-muted">{t('debts.detail.nextDue')}</dt>
            <dd className="mt-1 text-lg md:text-xl">{formatLongDate(debt.nextDueOn)}</dd>
          </div>
        )}
      </dl>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-4">
          {owed.amountMinor > 0n && <PaymentForm debt={debt} accounts={accounts} />}
          <Panel title={t('debts.detail.history')}>
            {payments.length === 0 ? (
              <p className="text-muted text-sm">{t('debts.detail.noPayments')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {payments.map((p) => (
                  <PaymentRow key={p.transactionId} debt={debt} payment={p} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="grid content-start gap-4">
          <Terms debt={debt} />
        </div>
      </div>
      <div className="mt-4">
        <Schedule debt={debt} schedule={schedule} />
      </div>
    </>
  );
}
