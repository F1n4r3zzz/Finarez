import { ASSET_SUBTYPES, type GoalView } from '@finanz/contracts';
import { type CurrencyCode, fromWire, type LocalDate, type Money, money } from '@finanz/kernel';
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
import { Panel } from '../../components/Panel';
import { formatAmountInput, parseAmountInput } from '../../lib/amount-input';
import { formatFullDate } from '../../lib/dates';
import { describeFailure, type Failure } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';
import { formatMoney } from '../../lib/money';
import { formatPercent } from '../../lib/percent';
import { NotFoundPage } from '../errors/NotFoundPage';
import { listAccounts } from '../ledger/api';
import { currencyOptions } from '../preferences/options';
import { createGoal, listGoals, listSavingsAccounts, updateGoal } from './api';

export async function savingsLoader() {
  const [goals, accounts, free] = await Promise.all([
    listGoals(),
    listAccounts(),
    listSavingsAccounts(),
  ]);
  return { goals, accounts, free };
}

export const amountOf = (minor: string, currency: CurrencyCode) =>
  fromWire({ amountMinor: minor, currency });

/** saved / target as a ratio between 0 and 1, computed in integers. */
export function progressOf(goal: GoalView): number {
  const target = BigInt(goal.targetMinor);
  const saved = BigInt(goal.savedMinor);
  if (target <= 0n || saved <= 0n) return 0;
  return saved >= target ? 1 : Number((saved * 10_000n) / target) / 10_000;
}

/** "Ahorra $ 8.000.000 al mes…", "Meta cumplida" or nothing, for a goal's subtitle. */
export function useGoalPace() {
  const { t } = useTranslation();
  return (goal: GoalView) => {
    if (BigInt(goal.savedMinor) >= BigInt(goal.targetMinor)) return t('savings.reached');
    if (goal.monthlyNeededMinor && BigInt(goal.monthlyNeededMinor) > 0n)
      return t('savings.monthly', {
        amount: formatMoney(amountOf(goal.monthlyNeededMinor, goal.currency)),
      });
    return undefined;
  };
}

export function GoalProgress({ goal }: { goal: GoalView }) {
  const { t } = useTranslation();
  const ratio = progressOf(goal);
  return (
    <div className="grid gap-2">
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-income" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="text-muted text-sm">
        {t('savings.progress', {
          share: formatPercent(ratio, { signed: false }),
          target: formatMoney(amountOf(goal.targetMinor, goal.currency)),
        })}
      </p>
    </div>
  );
}

function GoalCard({ goal }: { goal: GoalView }) {
  const { t } = useTranslation();
  const pace = useGoalPace()(goal);
  return (
    <Link
      to={`/savings/${goal.id}`}
      className="grid h-full gap-4 rounded-xl border border-line bg-surface p-5 transition-colors duration-150 hover:bg-hover"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="line-clamp-2 font-semibold">{goal.name}</span>
          <span className="block text-sm text-subtle">
            {goal.targetDate
              ? t('savings.by', { date: formatFullDate(goal.targetDate) })
              : t('savings.noDate')}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-muted text-sm">{t('savings.saved')}</span>
          <Amount value={amountOf(goal.savedMinor, goal.currency)} className="text-lg" />
        </span>
      </div>
      <GoalProgress goal={goal} />
      {pace && <p className="text-sm text-subtle">{pace}</p>}
    </Link>
  );
}

function totalsByCurrency(goals: readonly GoalView[]): Money[] {
  const totals = new Map<CurrencyCode, bigint>();
  for (const g of goals)
    totals.set(g.currency, (totals.get(g.currency) ?? 0n) + BigInt(g.savedMinor));
  return [...totals].map(([currency, amount]) => money(amount, currency));
}

/** Each account's balance, what is set aside in it and what is left to spend. */
function FreePerAccount({ data }: { data: Awaited<ReturnType<typeof savingsLoader>> }) {
  const { t } = useTranslation();
  const names = new Map(data.accounts.map((a) => [a.id, a]));
  const rows = data.free.filter(
    (f) => BigInt(f.allocatedMinor) !== 0n && names.get(f.accountId) !== undefined,
  );
  if (rows.length === 0) return null;
  return (
    <Panel title={t('savings.free.title')}>
      <p className="text-muted text-sm">{t('savings.free.hint')}</p>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((f) => {
          const over = BigInt(f.availableMinor) < 0n;
          return (
            <li key={f.accountId} className="grid gap-1 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className="line-clamp-2 font-medium">{names.get(f.accountId)?.name}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-subtle text-xs">{t('savings.free.available')}</span>
                  <Amount
                    value={amountOf(f.availableMinor, f.currency)}
                    className={over ? 'text-expense' : ''}
                  />
                </span>
              </div>
              <p className="text-sm text-subtle">
                {t('savings.free.detail', {
                  balance: formatMoney(amountOf(f.balanceMinor, f.currency)),
                  set: formatMoney(amountOf(f.allocatedMinor, f.currency)),
                })}
              </p>
              {over && <p className="text-expense text-sm">{t('savings.free.over')}</p>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function SavingsPage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof savingsLoader>();
  const active = data.goals.filter((g) => !g.archived);
  const canSave = data.accounts.some(
    (a) => !a.archived && (ASSET_SUBTYPES as readonly string[]).includes(a.subtype),
  );

  return (
    <>
      <PageHeader
        title={t('modules.savings.title')}
        description={t('modules.savings.description')}
        action={active.length > 0 && <ActionLink to="/savings/new" label={t('savings.add')} />}
      />
      {active.length === 0 ? (
        <EmptyState
          icon={moduleById('savings').icon}
          title={t('savings.emptyTitle')}
          body={t(canSave ? 'savings.emptyBody' : 'savings.needAccount')}
        >
          <div className="mt-6 flex justify-center">
            <ActionLink
              to={canSave ? '/savings/new' : '/accounts/new'}
              label={t(canSave ? 'savings.add' : 'ledger.accounts.add')}
            />
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          <dl>
            <dt className="text-sm text-muted">{t('savings.total')}</dt>
            {totalsByCurrency(active).map((total) => (
              <dd key={total.currency} className="mt-1 text-2xl">
                <Amount value={total} />
              </dd>
            ))}
          </dl>
          <ul className="grid gap-4 md:grid-cols-2">
            {active.map((g) => (
              <li key={g.id}>
                <GoalCard goal={g} />
              </li>
            ))}
          </ul>
          <FreePerAccount data={data} />
        </div>
      )}
    </>
  );
}

type FieldKey = 'name' | 'target';
interface FormResult {
  fieldErrors?: Partial<Record<FieldKey, 'required' | 'amountInvalid'>>;
  failure?: Failure;
}

/** Name, target and date as typed; `currency` decides how the target is read. */
function readGoal(form: FormData, currency: CurrencyCode) {
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const errors: FormResult['fieldErrors'] = {};
  const name = field('name');
  if (!name) errors.name = 'required';
  let targetMinor = '';
  const text = field('target');
  if (!text) errors.target = 'required';
  else
    try {
      const value = parseAmountInput(text, currency, formattingLocale()).amountMinor;
      if (value <= 0n) throw new Error('not positive');
      targetMinor = value.toString();
    } catch {
      errors.target = 'amountInvalid';
    }
  return {
    errors,
    name,
    targetMinor,
    targetDate: (field('targetDate') || null) as LocalDate | null,
  };
}

export async function newGoalAction({
  request,
}: ActionFunctionArgs): Promise<FormResult | Response> {
  const form = await request.formData();
  const currency = String(form.get('currency') ?? '') as CurrencyCode;
  const { errors, ...goal } = readGoal(form, currency);
  if (Object.keys(errors).length) return { fieldErrors: errors };
  try {
    const created = await createGoal({ ...goal, currency }, String(form.get('idempotencyKey')));
    return redirect(`/savings/${created.id}`);
  } catch (error) {
    return { failure: describeFailure(error) };
  }
}

export async function editGoalLoader({ params }: LoaderFunctionArgs) {
  return { goal: (await listGoals()).find((g) => g.id === params.id) };
}

export async function editGoalAction({
  request,
  params,
}: ActionFunctionArgs): Promise<FormResult | Response> {
  const id = params.id ?? '';
  const goal = (await listGoals()).find((g) => g.id === id);
  if (!goal) return { failure: { key: 'unexpected' } };
  const { errors, ...changes } = readGoal(await request.formData(), goal.currency);
  if (Object.keys(errors).length) return { fieldErrors: errors };
  try {
    await updateGoal(id, changes);
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return redirect(`/savings/${id}`);
}

function GoalForm({ goal }: { goal?: GoalView }) {
  const { t, i18n } = useTranslation();
  const { preferences } = useAccount();
  const result = useActionData<FormResult>();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const error = (key: FieldKey) => {
    const code = result?.fieldErrors?.[key];
    return code ? t(`savings.fields.${code}`) : undefined;
  };

  return (
    <Form method="post" noValidate className="grid max-w-lg gap-5">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <TextField
        label={t('savings.form.name')}
        name="name"
        defaultValue={goal?.name}
        hint={t('savings.form.nameHint')}
        error={error('name')}
        autoComplete="off"
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t('savings.form.target')}
          name="target"
          inputMode="decimal"
          defaultValue={
            goal
              ? formatAmountInput(amountOf(goal.targetMinor, goal.currency), formattingLocale())
              : undefined
          }
          error={error('target')}
        />
        {goal ? (
          <TextField
            label={t('savings.form.currency')}
            name="currencyShown"
            value={goal.currency}
            readOnly
            disabled
            hint={t('savings.form.currencyFixed')}
          />
        ) : (
          <SelectField
            label={t('savings.form.currency')}
            name="currency"
            defaultValue={preferences.primaryCurrency}
          >
            {currencyOptions(i18n.resolvedLanguage ?? 'es').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      <TextField
        label={t('savings.form.date')}
        name="targetDate"
        type="date"
        defaultValue={goal?.targetDate ?? undefined}
      />
      <FailureNotice failure={result?.failure} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={submitting}>
          {goal
            ? t(submitting ? 'savings.form.saving' : 'savings.form.save')
            : t(submitting ? 'savings.form.submitting' : 'savings.form.submit')}
        </Button>
        {goal && (
          <Link
            to={`/savings/${goal.id}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 font-medium transition-colors duration-150 hover:bg-hover"
          >
            {t('savings.form.cancel')}
          </Link>
        )}
      </div>
    </Form>
  );
}

export function NewGoalPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('savings.form.title')} description={t('savings.emptyBody')} />
      <GoalForm />
    </>
  );
}

export function EditGoalPage() {
  const { t } = useTranslation();
  const { goal } = useLoaderData<typeof editGoalLoader>();
  if (!goal) return <NotFoundPage />;
  return (
    <>
      <PageHeader title={t('savings.form.editTitle')} description={goal.name} />
      <GoalForm goal={goal} />
    </>
  );
}
