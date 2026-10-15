import type { Category, MonthlyReport, Preferences } from '@finanz/contracts';
import { type CurrencyCode, money, todayIn } from '@finanz/kernel';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  Link,
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from 'react-router';
import { moduleById } from '../../app/modules';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { ColumnChart } from '../../components/charts/ColumnChart';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Stat } from '../../components/Stat';
import { api } from '../../lib/api';
import { formatFullDate } from '../../lib/dates';
import { formattingLocale } from '../../lib/locale';
import { formatMoney } from '../../lib/money';
import { changeRatio, formatPercent } from '../../lib/percent';
import { getSummary, listCategories } from '../ledger/api';
import { type Period, type PeriodId, PRESETS, periodFromSearch } from './period';

const getMonthly = (from: string, to: string) =>
  api<MonthlyReport>('GET', `/reports/monthly?from=${from}&to=${to}`);

export async function reportsLoader({ request }: LoaderFunctionArgs) {
  const preferences = await api<Preferences>('GET', '/me/preferences');
  const today = todayIn(preferences.timeZone);
  const { period, invalid } = periodFromSearch(new URL(request.url).searchParams, today);
  const [monthly, previous, categories] = await Promise.all([
    getMonthly(period.from, period.to),
    getSummary(period.previous.from, period.previous.to),
    listCategories(),
  ]);
  return { period, invalid, monthly, previous, categories };
}

/** Choosing a category only changes what is shown; the data stays the same. */
export function reportsShouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  const withoutCategory = (url: URL) => {
    const search = new URLSearchParams(url.search);
    search.delete('category');
    return `${url.pathname}?${search}`;
  };
  if (withoutCategory(currentUrl) === withoutCategory(nextUrl)) return false;
  return defaultShouldRevalidate;
}

const UNCATEGORIZED = 'none';
const sum = (values: readonly bigint[]) => values.reduce((a, b) => a + b, 0n);
/** a / b, rounded half up to the minor unit. */
const divide = (a: bigint, b: bigint) => (b === 0n ? 0n : (a * 2n + b) / (2n * b));

function monthLabels(months: MonthlyReport['months']) {
  const locale = formattingLocale();
  const date = (m: string) => new Date(`${m}-01T00:00:00Z`);
  const short = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    ticks: months.map((m, i) => ({
      label: short.format(date(m.month)).replace('.', ''),
      // The year under the first month and under every January.
      sub: i === 0 || m.month.endsWith('-01') ? m.month.slice(0, 4) : undefined,
    })),
    longLabels: months.map((m) => long.format(date(m.month))),
  };
}

/** Spending per top-level category (subcategories roll up into their parent). */
function spendingByCategory(report: MonthlyReport, categories: readonly Category[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rootOf = (id: string) => byId.get(id)?.parentId ?? id;
  const roots = new Map<string, { total: bigint; children: Map<string, bigint> }>();
  for (const month of report.months) {
    for (const line of month.expensesByCategory) {
      const root = rootOf(line.categoryId);
      const entry = roots.get(root) ?? { total: 0n, children: new Map() };
      const amount = BigInt(line.amountMinor);
      entry.total += amount;
      if (root !== line.categoryId)
        entry.children.set(line.categoryId, (entry.children.get(line.categoryId) ?? 0n) + amount);
      roots.set(root, entry);
    }
  }
  const ranked = [...roots]
    .filter(([, v]) => v.total > 0n)
    .sort(([, a], [, b]) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0))
    .map(([id, v]) => ({ id, ...v }));
  const perMonth = (rootId: string) =>
    report.months.map((m) =>
      sum(
        m.expensesByCategory
          .filter((l) => rootOf(l.categoryId) === rootId)
          .map((l) => BigInt(l.amountMinor)),
      ),
    );
  return { ranked, perMonth };
}

function PeriodPicker({ period, invalid }: { period: Period; invalid: boolean }) {
  const { t } = useTranslation();
  const [search] = useSearchParams();
  const [custom, setCustom] = useState(period.id === 'custom');
  const link = (id: PeriodId) => {
    const next = new URLSearchParams();
    next.set('period', id);
    const category = search.get('category');
    if (category) next.set('category', category);
    return `?${next}`;
  };
  const pill = (active: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors duration-150 ${
      active
        ? 'border-brand bg-brand-soft font-medium text-brand'
        : 'border-line bg-surface text-muted hover:bg-hover hover:text-ink'
    }`;

  return (
    <div className="mb-6 grid gap-3">
      <nav
        aria-label={t('reports.periodLabel')}
        className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
      >
        <ul className="flex gap-2 md:flex-wrap">
          {PRESETS.map((id) => (
            <li key={id}>
              <Link
                to={link(id)}
                aria-current={period.id === id ? 'page' : undefined}
                onClick={() => setCustom(false)}
                className={pill(period.id === id && !custom)}
              >
                {period.id === id && !custom && (
                  <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                )}
                {t(`reports.periods.${id}`)}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-expanded={custom}
              onClick={() => setCustom(true)}
              className={pill(custom)}
            >
              {custom && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
              {t('reports.periods.custom')}
            </button>
          </li>
        </ul>
      </nav>
      {custom && (
        <Form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value="custom" />
          <div className="w-44">
            <TextField
              label={t('reports.customFrom')}
              name="from"
              type="date"
              defaultValue={period.from}
            />
          </div>
          <div className="w-44">
            <TextField
              label={t('reports.customTo')}
              name="to"
              type="date"
              defaultValue={period.to}
            />
          </div>
          <Button type="submit" variant="secondary">
            {t('reports.customApply')}
          </Button>
        </Form>
      )}
      <p className="text-muted text-sm">
        {t('reports.range', { from: formatFullDate(period.from), to: formatFullDate(period.to) })}
      </p>
      {invalid && <Notice tone="info">{t('reports.invalidRange')}</Notice>}
    </div>
  );
}

function CategoryList({
  ranked,
  total,
  selected,
  names,
  currency,
}: {
  ranked: { id: string; total: bigint }[];
  total: bigint;
  selected: string | undefined;
  names: (id: string) => string;
  currency: CurrencyCode;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useSearchParams();
  const [all, setAll] = useState(false);
  const shown = all ? ranked : ranked.slice(0, 8);
  const max = ranked[0]?.total ?? 1n;
  const choose = (id: string) => {
    const next = new URLSearchParams(search);
    next.set('category', id);
    setSearch(next, { preventScrollReset: true, replace: true });
  };

  return (
    <Panel title={t('reports.categoriesTitle')}>
      <ul className="-mx-2 grid gap-1">
        {shown.map((c) => {
          const share = Number((c.total * 1000n) / (total || 1n)) / 1000;
          const active = c.id === selected;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => choose(c.id)}
                className={`grid w-full gap-1.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 ${
                  active ? 'bg-brand-soft' : 'hover:bg-hover'
                }`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{names(c.id)}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="text-subtle text-xs">
                      {formatPercent(share, { signed: false })}
                    </span>
                    <Amount value={money(c.total, currency)} className="text-sm" />
                  </span>
                </span>
                <span aria-hidden="true" className="h-2 rounded-full bg-bar-track">
                  <span
                    className="block h-2 rounded-full bg-bar"
                    style={{ width: `${Math.max(1, Number((c.total * 1000n) / max) / 10)}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {ranked.length > 8 && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          aria-expanded={all}
          className="mt-2 -ml-2 inline-flex min-h-11 items-center rounded-md px-2 font-medium text-brand text-sm transition-colors duration-150 hover:bg-brand-soft"
        >
          {all ? t('reports.showFewer') : t('reports.showAllCategories', { count: ranked.length })}
        </button>
      )}
    </Panel>
  );
}

/** Reportes: where the money went in a period, month by month and by category. */
export function ReportsPage() {
  const { t } = useTranslation();
  const { period, invalid, monthly, previous, categories } = useLoaderData<typeof reportsLoader>();
  const [search] = useSearchParams();
  const navigation = useNavigation();
  const reloading = navigation.state === 'loading' && navigation.location?.pathname === '/reports';
  const currency = monthly.currency;
  const months = monthly.months;
  const income = sum(months.map((m) => BigInt(m.incomeMinor)));
  const expenses = sum(months.map((m) => BigInt(m.expensesMinor)));
  const net = income - expenses;
  const as = (v: bigint) => money(v, currency);
  const versus = t(`reports.versus.${period.previous.kind}`, {
    count: period.previous.months ?? 0,
  });
  const incomeRatio = changeRatio(as(income), as(BigInt(previous.incomeMinor)));
  const spendRatio = changeRatio(as(expenses), as(BigInt(previous.expensesMinor)));
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const name = (id: string) =>
    id === UNCATEGORIZED
      ? t('reports.uncategorized')
      : (names.get(id) ?? t('reports.uncategorized'));
  const { ranked, perMonth } = spendingByCategory(monthly, categories);
  const selected = ranked.find((c) => c.id === search.get('category')) ?? ranked[0];
  const { ticks, longLabels } = monthLabels(months);
  const missing = [...new Set([...monthly.excluded, ...previous.excluded].map((e) => e.currency))];
  const empty = income === 0n && expenses === 0n;

  return (
    <>
      <PageHeader
        title={t('modules.reports.title')}
        description={t('modules.reports.description')}
      />
      <PeriodPicker
        key={`${period.id}:${period.from}:${period.to}`}
        period={period}
        invalid={invalid}
      />
      {missing.length > 0 && (
        <Notice tone="info" className="mb-6">
          <p>
            {t('dashboard.missingRates', { currencies: missing.join(', ') })}{' '}
            <Link
              to="/settings"
              className="font-medium text-brand underline-offset-4 hover:underline"
            >
              {t('dashboard.addRates')}
            </Link>
          </p>
        </Notice>
      )}
      {empty ? (
        <EmptyState
          icon={moduleById('reports').icon}
          title={t('reports.emptyTitle')}
          body={t('reports.emptyBody')}
        />
      ) : (
        <div
          className={`grid gap-4 transition-opacity duration-150 ${reloading ? 'opacity-60' : ''}`}
        >
          <section
            aria-label={t('reports.totals')}
            className="rounded-xl border border-line bg-surface p-5 md:p-6"
          >
            <dl className="grid gap-5 sm:grid-cols-3">
              <Stat
                label={t('reports.income')}
                value={formatMoney(as(income))}
                delta={
                  incomeRatio === undefined
                    ? undefined
                    : { ratio: incomeRatio, label: versus, upIsGood: true }
                }
              />
              <Stat
                label={t('reports.expenses')}
                value={formatMoney(as(expenses))}
                delta={
                  spendRatio === undefined
                    ? undefined
                    : { ratio: spendRatio, label: versus, upIsGood: false }
                }
              />
              <div>
                <dt className="text-sm text-muted">{t('reports.net')}</dt>
                <dd className="amount mt-1 text-xl md:text-2xl">
                  <Amount value={as(net)} signed />
                </dd>
                <dd className="mt-1.5 text-sm text-muted">
                  {net >= 0n
                    ? income > 0n &&
                      t('reports.savingsRate', {
                        share: formatPercent(Number((net * 1000n) / income) / 1000, {
                          signed: false,
                        }),
                      })
                    : t('reports.overspent', { amount: formatMoney(as(-net)) })}
                </dd>
              </div>
            </dl>
          </section>

          <Panel title={t('reports.monthlyTitle')}>
            {months.length > 1 ? (
              <ColumnChart
                title={t('reports.monthlyTitle')}
                ticks={ticks}
                longLabels={longLabels}
                currency={currency}
                series={[
                  {
                    key: 'income',
                    label: t('reports.income'),
                    fill: 'fill-chart-income',
                    swatch: 'bg-chart-income',
                    values: months.map((m) => BigInt(m.incomeMinor)),
                  },
                  {
                    key: 'expenses',
                    label: t('reports.expenses'),
                    fill: 'fill-chart-expense',
                    swatch: 'bg-chart-expense',
                    values: months.map((m) => BigInt(m.expensesMinor)),
                  },
                ]}
                extra={{ label: t('reports.net'), values: months.map((m) => BigInt(m.netMinor)) }}
              />
            ) : (
              <p className="text-muted text-sm">{t('reports.monthlyHint')}</p>
            )}
          </Panel>

          {selected && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <CategoryList
                ranked={ranked}
                total={expenses}
                selected={selected.id}
                names={name}
                currency={currency}
              />
              <Panel title={t('reports.categoryTitle', { category: name(selected.id) })}>
                {months.length > 1 ? (
                  <ColumnChart
                    title={t('reports.categoryTitle', { category: name(selected.id) })}
                    ticks={ticks}
                    longLabels={longLabels}
                    currency={currency}
                    series={[
                      {
                        key: selected.id,
                        label: name(selected.id),
                        fill: 'fill-bar',
                        swatch: 'bg-bar',
                        values: perMonth(selected.id),
                      },
                    ]}
                    average={{
                      label: t('reports.average'),
                      value: divide(selected.total, BigInt(months.length)),
                    }}
                  />
                ) : (
                  <p className="text-muted text-sm">{t('reports.monthlyHint')}</p>
                )}
                {selected.children.size > 0 && (
                  <div className="mt-4 border-line border-t pt-4">
                    <h3 className="mb-2 font-medium text-sm">{t('reports.subcategories')}</h3>
                    <ul className="grid gap-1.5 text-sm">
                      {[...selected.children]
                        .sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
                        .map(([id, amount]) => (
                          <li key={id} className="flex justify-between gap-4">
                            <span className="text-muted">{name(id)}</span>
                            <Amount value={as(amount)} />
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </Panel>
            </div>
          )}
        </div>
      )}
    </>
  );
}
