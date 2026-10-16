import {
  BUDGET_PERIODS,
  type BudgetPeriod,
  type BudgetView,
  type Category,
} from '@finanz/contracts';
import { type CurrencyCode, todayIn } from '@finanz/kernel';
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
import { listCategories } from '../ledger/api';
import { currencyOptions } from '../preferences/options';
import { createBudget, getBudget, listBudgets, updateBudget } from './api';
import { amountOf, useCategoryNames } from './BudgetsPage';
import { monthStart, monthsFrom, monthYear, shiftMonth } from './periods';

type FieldKey = 'category' | 'amount';
interface FormResult {
  fieldErrors?: Partial<Record<FieldKey, 'required' | 'amountInvalid'>>;
  failure?: Failure;
}

/** The limit as typed, read in `currency`. */
function readAmount(form: FormData, currency: CurrencyCode) {
  const text = String(form.get('amount') ?? '').trim();
  if (!text) return { error: 'required' as const };
  try {
    const value = parseAmountInput(text, currency, formattingLocale()).amountMinor;
    if (value <= 0n) throw new Error('not positive');
    return { amountMinor: value.toString() };
  } catch {
    return { error: 'amountInvalid' as const };
  }
}

export async function newBudgetLoader() {
  const [budgets, categories] = await Promise.all([listBudgets(), listCategories()]);
  return { budgets, categories };
}

export async function newBudgetAction({
  request,
}: ActionFunctionArgs): Promise<FormResult | Response> {
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const currency = field('currency') as CurrencyCode;
  const errors: FormResult['fieldErrors'] = {};
  const categoryId = field('categoryId');
  if (!categoryId) errors.category = 'required';
  const amount = readAmount(form, currency);
  if (amount.error) errors.amount = amount.error;
  if (Object.keys(errors).length || !amount.amountMinor) return { fieldErrors: errors };
  try {
    const created = await createBudget(
      {
        categoryId,
        period: field('period') as BudgetPeriod,
        currency,
        amountMinor: amount.amountMinor,
        carryover: form.get('carryover') === 'on',
        startsOn: monthStart(field('from')),
      },
      field('idempotencyKey'),
    );
    return redirect(`/budgets/${created.id}`);
  } catch (error) {
    return { failure: describeFailure(error) };
  }
}

export async function editBudgetLoader({ params }: LoaderFunctionArgs) {
  try {
    const [budget, categories] = await Promise.all([getBudget(params.id ?? ''), listCategories()]);
    return { budget: budget.archived ? undefined : budget, categories };
  } catch (error) {
    if (isApiFailure(error, 404)) return { budget: undefined, categories: [] as Category[] };
    throw error;
  }
}

export async function editBudgetAction({
  request,
  params,
}: ActionFunctionArgs): Promise<FormResult | Response> {
  const id = params.id ?? '';
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '');
  const amount = readAmount(form, field('currency') as CurrencyCode);
  if (amount.error || !amount.amountMinor) return { fieldErrors: { amount: amount.error } };
  // Saving only the carryover leaves the limits alone, including any set for later months.
  const sameLimit =
    amount.amountMinor === field('currentLimit') && field('from') === field('defaultFrom');
  try {
    await updateBudget(id, {
      ...(sameLimit ? {} : { amountMinor: amount.amountMinor, from: monthStart(field('from')) }),
      carryover: form.get('carryover') === 'on',
    });
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return redirect(`/budgets/${id}`);
}

function useFieldError() {
  const { t } = useTranslation();
  const result = useActionData<FormResult>();
  return {
    result,
    error: (key: FieldKey) => {
      const code = result?.fieldErrors?.[key];
      return code ? t(`budgets.fields.${code}`) : undefined;
    },
  };
}

/** Expense categories: each parent with its subcategories, the ones already budgeted disabled. */
function CategoryField({
  categories,
  taken,
  error,
}: {
  categories: readonly Category[];
  taken: ReadonlySet<string>;
  error?: string;
}) {
  const { t } = useTranslation();
  const active = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'es');
  const roots = active.filter((c) => !c.parentId).sort(byName);
  const option = (c: Category, label = c.name) => (
    <option key={c.id} value={c.id} disabled={taken.has(c.id)}>
      {taken.has(c.id) ? t('budgets.form.taken', { name: c.name }) : label}
    </option>
  );
  return (
    <SelectField
      label={t('budgets.form.category')}
      name="categoryId"
      defaultValue=""
      hint={t('budgets.form.categoryHint')}
      error={error}
    >
      <option value="" disabled>
        {t('budgets.form.choose')}
      </option>
      {roots.map((root) => {
        const children = active.filter((c) => c.parentId === root.id).sort(byName);
        if (children.length === 0) return option(root);
        return (
          <optgroup key={root.id} label={root.name}>
            {option(root, t('budgets.form.whole', { name: root.name }))}
            {children.map((c) => option(c))}
          </optgroup>
        );
      })}
    </SelectField>
  );
}

function CarryoverField({ defaultChecked }: { defaultChecked: boolean }) {
  const { t } = useTranslation();
  return (
    <label className="flex gap-3">
      <input
        type="checkbox"
        name="carryover"
        defaultChecked={defaultChecked}
        className="mt-1 size-5 shrink-0 accent-brand"
      />
      <span>
        <span className="block font-medium">{t('budgets.form.carryover')}</span>
        <span className="block text-sm text-muted">{t('budgets.form.carryoverHint')}</span>
      </span>
    </label>
  );
}

/** Months to start from: two years back to one ahead, labeled "octubre de 2026". */
function MonthField({
  label,
  hint,
  months,
  defaultValue,
}: {
  label: string;
  hint: string;
  months: readonly string[];
  defaultValue: string;
}) {
  return (
    <SelectField label={label} name="from" defaultValue={defaultValue} hint={hint}>
      {months.map((m) => (
        <option key={m} value={m}>
          {monthYear(m)}
        </option>
      ))}
    </SelectField>
  );
}

function Actions({ editing, cancelTo }: { editing: boolean; cancelTo?: string }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  return (
    <div className="flex flex-wrap gap-3">
      <Button type="submit" pending={submitting}>
        {editing
          ? t(submitting ? 'budgets.form.saving' : 'budgets.form.save')
          : t(submitting ? 'budgets.form.submitting' : 'budgets.form.submit')}
      </Button>
      {cancelTo && (
        <Link
          to={cancelTo}
          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 font-medium transition-colors duration-150 hover:bg-hover"
        >
          {t('budgets.form.cancel')}
        </Link>
      )}
    </div>
  );
}

export function NewBudgetPage() {
  const { t, i18n } = useTranslation();
  const { budgets, categories } = useLoaderData<typeof newBudgetLoader>();
  const { preferences } = useAccount();
  const { result, error } = useFieldError();
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const current = todayIn(preferences.timeZone).slice(0, 7);
  const taken = new Set(budgets.map((b) => b.categoryId));

  return (
    <>
      <PageHeader title={t('budgets.form.title')} description={t('empty.budgets.body')} />
      <Form method="post" noValidate className="grid max-w-lg gap-5">
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <CategoryField categories={categories} taken={taken} error={error('category')} />
        <Segmented
          legend={t('budgets.form.period')}
          name="period"
          value={period}
          onChange={setPeriod}
          options={BUDGET_PERIODS.map((p) => ({ value: p, label: t(`budgets.period.${p}`) }))}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label={t(`budgets.form.amount.${period}`)}
            name="amount"
            inputMode="decimal"
            error={error('amount')}
          />
          <SelectField
            label={t('budgets.form.currency')}
            name="currency"
            defaultValue={preferences.primaryCurrency}
          >
            {currencyOptions(i18n.resolvedLanguage ?? 'es').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
        </div>
        <MonthField
          label={t('budgets.form.from')}
          hint={t(`budgets.form.fromHint.${period}`)}
          months={monthsFrom(shiftMonth(current, -24), shiftMonth(current, 12))}
          defaultValue={current}
        />
        <CarryoverField defaultChecked={false} />
        <FailureNotice failure={result?.failure} />
        <Actions editing={false} />
      </Form>
    </>
  );
}

export function EditBudgetPage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof editBudgetLoader>();
  const { preferences } = useAccount();
  const { result, error } = useFieldError();
  const names = useCategoryNames(data.categories);
  if (!data.budget) return <NotFoundPage />;
  const budget: BudgetView = data.budget;
  const current = todayIn(preferences.timeZone).slice(0, 7);
  const start = budget.startsOn.slice(0, 7);
  const months = monthsFrom(start, shiftMonth(current > start ? current : start, 12));

  return (
    <>
      <PageHeader title={t('budgets.form.editTitle')} description={names(budget.categoryId).name} />
      <Form method="post" noValidate className="grid max-w-lg gap-5">
        <input type="hidden" name="currency" value={budget.currency} />
        <input type="hidden" name="currentLimit" value={budget.limitMinor} />
        <input type="hidden" name="defaultFrom" value={current > start ? current : start} />
        <TextField
          label={t(`budgets.form.amount.${budget.period}`)}
          name="amount"
          inputMode="decimal"
          defaultValue={formatAmountInput(
            amountOf(budget.limitMinor, budget.currency),
            formattingLocale(),
          )}
          hint={t('budgets.form.currencyFixed', { currency: budget.currency })}
          error={error('amount')}
        />
        <MonthField
          label={t('budgets.form.applyFrom')}
          hint={t('budgets.form.applyFromHint')}
          months={months}
          defaultValue={current > start ? current : start}
        />
        <CarryoverField defaultChecked={budget.carryover} />
        <p className="text-sm text-subtle">{t('budgets.form.fixed')}</p>
        <FailureNotice failure={result?.failure} />
        <Actions editing cancelTo={`/budgets/${budget.id}`} />
      </Form>
    </>
  );
}
