import type { BudgetPeriodView, BudgetView, Category } from '@finanz/contracts';
import { type CurrencyCode, fromWire, type LocalDate, money, todayIn } from '@finanz/kernel';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { useAccount } from '../../app/account';
import { moduleById } from '../../app/modules';
import { ActionLink } from '../../components/ActionLink';
import { Amount } from '../../components/Amount';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { formatMoney } from '../../lib/money';
import { listCategories } from '../ledger/api';
import { listBudgets } from './api';
import { daysLeft, monthName, monthStart, monthYear, shiftMonth } from './periods';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function budgetsLoader({ request }: LoaderFunctionArgs) {
  const asked = new URL(request.url).searchParams.get('month');
  const month = asked && MONTH.test(asked) ? asked : undefined;
  const [budgets, categories] = await Promise.all([
    listBudgets(month ? monthStart(month) : undefined),
    listCategories(),
  ]);
  return { month, budgets, categories };
}

export const amountOf = (minor: string, currency: CurrencyCode) =>
  fromWire({ amountMinor: minor, currency });

/** A category's name, its parent's and whether it has subcategories, for titles and sorting. */
export function useCategoryNames(categories: readonly Category[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const parents = new Set(categories.filter((c) => c.parentId).map((c) => c.parentId));
  return (id: string) => {
    const category = byId.get(id);
    const parent = category?.parentId ? byId.get(category.parentId) : undefined;
    return {
      name: category?.name ?? '',
      parent: parent?.name,
      hasChildren: parents.has(id),
      sortKey: parent ? `${parent.name}\u0000${category?.name}` : (category?.name ?? ''),
    };
  };
}

/** "Mensual, con sus subcategorías", "Trimestral, en Servicios del hogar"… */
export function useScope(categories: readonly Category[]) {
  const { t } = useTranslation();
  const names = useCategoryNames(categories);
  return (budget: BudgetView) => {
    const { parent, hasChildren } = names(budget.categoryId);
    const period = t(`budgets.period.${budget.period}`);
    if (parent) return t('budgets.scope.child', { period, parent });
    return hasChildren ? t('budgets.scope.parent', { period }) : period;
  };
}

/** "octubre de 2026", "octubre a diciembre de 2026" or "2026". */
export function usePeriodName() {
  const { t } = useTranslation();
  return (kind: BudgetView['period'], period: { from: string; to: string }) => {
    if (kind === 'monthly') return monthYear(period.from);
    if (kind === 'yearly') return period.from.slice(0, 4);
    return t('budgets.quarter', {
      first: monthName(period.from),
      last: monthName(period.to),
      year: period.from.slice(0, 4),
    });
  };
}

/** spent / available between 0 and 1, computed in integers; full when nothing is left. */
function shareSpent(period: BudgetPeriodView): number {
  const available = BigInt(period.availableMinor);
  const spent = BigInt(period.spentMinor);
  if (spent <= 0n) return 0;
  if (available <= 0n || spent >= available) return 1;
  return Number((spent * 10_000n) / available) / 10_000;
}

export function SpendBar({ period }: { period: BudgetPeriodView }) {
  return (
    <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-bar-track">
      <div
        className={`h-full rounded-full ${period.overspent ? 'bg-expense' : 'bg-bar'}`}
        style={{ width: `${shareSpent(period) * 100}%` }}
      />
    </div>
  );
}

/** What is left or overspent, how much was spent, carryover and missing rates. */
export function PeriodStatus({
  budget,
  period,
  today,
  large = false,
}: {
  budget: BudgetView;
  period: BudgetPeriodView;
  today: LocalDate;
  large?: boolean;
}) {
  const { t } = useTranslation();
  const remaining = BigInt(period.remainingMinor);
  const carried = BigInt(period.carriedMinor);
  const amount = (minor: string | bigint) => amountOf(minor.toString(), budget.currency);
  const running = period.from <= today && today <= period.to;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className={period.overspent ? 'font-medium text-expense' : 'text-muted'}>
          {t(period.overspent ? 'budgets.over' : 'budgets.left')}
        </span>
        <Amount
          value={amount(remaining < 0n ? -remaining : remaining)}
          className={`${large ? 'text-2xl md:text-3xl' : 'text-lg'} ${period.overspent ? 'text-expense' : ''}`}
        />
      </div>
      <SpendBar period={period} />
      <p className="text-sm text-muted">
        {t('budgets.spentOf', {
          spent: formatMoney(amount(period.spentMinor)),
          available: formatMoney(amount(period.availableMinor)),
        })}
        {running && ` ${t('budgets.daysLeft', { count: daysLeft(today, period.to) })}`}
      </p>
      {carried !== 0n && (
        <p className="text-sm text-subtle">
          {t(carried > 0n ? 'budgets.carriedIn' : 'budgets.carriedOut', {
            amount: formatMoney(amount(carried > 0n ? carried : -carried)),
          })}
        </p>
      )}
      {period.excluded.length > 0 && (
        <p className="text-sm text-subtle">
          {t('budgets.missingRates', {
            currencies: [...new Set(period.excluded.map((e) => e.currency))].join(', '),
          })}
        </p>
      )}
    </div>
  );
}

function BudgetCard({
  budget,
  categories,
  today,
}: {
  budget: BudgetView;
  categories: readonly Category[];
  today: LocalDate;
}) {
  const { t } = useTranslation();
  const names = useCategoryNames(categories);
  const scope = useScope(categories)(budget);
  const periodName = usePeriodName();
  return (
    <Link
      to={`/budgets/${budget.id}`}
      className="grid h-full gap-4 rounded-[22px] border border-line bg-surface p-5 transition-colors duration-150 hover:bg-hover"
    >
      <span className="min-w-0">
        <span className="line-clamp-2 font-semibold">{names(budget.categoryId).name}</span>
        <span className="block text-sm text-subtle">
          {budget.current && budget.period !== 'monthly'
            ? `${scope}: ${periodName(budget.period, budget.current)}`
            : scope}
        </span>
      </span>
      {budget.current ? (
        <PeriodStatus budget={budget} period={budget.current} today={today} />
      ) : (
        <p className="text-sm text-muted">
          {t('budgets.startsIn', {
            month: monthYear(budget.startsOn),
            limit: formatMoney(amountOf(budget.limitMinor, budget.currency)),
          })}
        </p>
      )}
    </Link>
  );
}

/** Monthly budgets in one currency, added up; other periods and currencies don't mix in. */
function MonthTotals({ budgets, currency }: { budgets: BudgetView[]; currency: CurrencyCode }) {
  const { t } = useTranslation();
  const monthly = budgets.filter((b) => b.period === 'monthly' && b.currency === currency);
  let spent = 0n;
  let available = 0n;
  for (const b of monthly) {
    if (!b.current) continue;
    spent += BigInt(b.current.spentMinor);
    available += BigInt(b.current.availableMinor);
  }
  const over = budgets.filter((b) => b.current?.overspent).length;
  if (monthly.every((b) => !b.current)) return null;
  return (
    <div className="grid gap-1">
      <p className="text-sm text-muted">{t('budgets.totals.title')}</p>
      <p className="text-2xl">
        <Amount value={money(spent, currency)} />
      </p>
      <p className="text-sm text-muted">
        {t('budgets.totals.of', { available: formatMoney(money(available, currency)) })}
      </p>
      {over > 0 && (
        <p className="font-medium text-expense text-sm">
          {t('budgets.totals.over', { count: over })}
        </p>
      )}
    </div>
  );
}

function MonthNav({ month, current }: { month: string; current: string }) {
  const { t } = useTranslation();
  const link = (target: string) => (target === current ? '/budgets' : `/budgets?month=${target}`);
  const arrow =
    'inline-flex size-11 items-center justify-center rounded-lg border border-line bg-surface transition-colors duration-150 hover:bg-hover';
  return (
    <nav aria-label={t('budgets.nav.label')} className="flex items-center gap-3">
      <Link
        to={link(shiftMonth(month, -1))}
        className={arrow}
        aria-label={t('budgets.nav.previous')}
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </Link>
      <p aria-live="polite" className="min-w-40 text-center font-medium first-letter:uppercase">
        {month === current ? t('budgets.nav.thisMonth') : monthYear(month)}
      </p>
      <Link to={link(shiftMonth(month, 1))} className={arrow} aria-label={t('budgets.nav.next')}>
        <ChevronRight aria-hidden="true" className="size-5" />
      </Link>
    </nav>
  );
}

export function BudgetsPage() {
  const { t } = useTranslation();
  const { month: asked, budgets, categories } = useLoaderData<typeof budgetsLoader>();
  const { preferences } = useAccount();
  const today = todayIn(preferences.timeZone);
  const current = today.slice(0, 7);
  const month = asked ?? current;
  const names = useCategoryNames(categories);
  // Overspent first, so the ones that need attention are at the top; then by category.
  const over = (b: BudgetView) => (b.current?.overspent ? 0 : 1);
  const sorted = [...budgets].sort(
    (a, b) =>
      over(a) - over(b) ||
      names(a.categoryId).sortKey.localeCompare(names(b.categoryId).sortKey, 'es'),
  );

  return (
    <>
      <PageHeader
        title={t('modules.budgets.title')}
        description={t('modules.budgets.description')}
        action={
          budgets.length > 0 && (
            <ActionLink to="/budgets/new" label={t('budgets.add')} variant="band" />
          )
        }
      />
      {budgets.length === 0 ? (
        <EmptyState
          icon={moduleById('budgets').icon}
          title={t('empty.budgets.title')}
          body={t('empty.budgets.body')}
        >
          <div className="mt-6 flex justify-center">
            <ActionLink to="/budgets/new" label={t('budgets.add')} />
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <MonthTotals budgets={budgets} currency={preferences.primaryCurrency as CurrencyCode} />
            <MonthNav month={month} current={current} />
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {sorted.map((b) => (
              <li key={b.id}>
                <BudgetCard budget={b} categories={categories} today={today} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
