import type { Category, SummaryReport } from '@finanz/contracts';
import { type CurrencyCode, type LocalDate, money } from '@finanz/kernel';
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LoaderFunctionArgs, useFetcher } from 'react-router';
import { DonutChart } from '../../components/charts/DonutChart';
import { FailureNotice } from '../../components/FailureNotice';
import { TextField } from '../../components/Field';
import { Panel } from '../../components/Panel';
import { formatLongDate, formatShortDate } from '../../lib/dates';
import { describeFailure, type Failure } from '../../lib/failure';
import { formatMoney } from '../../lib/money';
import { formatPercent } from '../../lib/percent';
import { getSummary } from '../ledger/api';
import {
  type Slice,
  SPENDING_PERIODS,
  type SpendingPeriod,
  spendingRange,
  spendingSlices,
} from './spending';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface SpendingResult {
  summary?: SummaryReport;
  failure?: Failure;
}

/** Spending between `from` and `to`, for the Inicio panel when the period changes. */
export async function spendingLoader({ request }: LoaderFunctionArgs): Promise<SpendingResult> {
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if (!DATE.test(from) || !DATE.test(to) || from > to) return { failure: { key: 'unexpected' } };
  try {
    return { summary: await getSummary(from, to) };
  } catch (error) {
    return { failure: describeFailure(error) };
  }
}

// Literal class names, so the stylesheet keeps them.
const FILLS = ['fill-slice-1', 'fill-slice-2', 'fill-slice-3', 'fill-slice-4', 'fill-slice-5'];
const SWATCHES = ['bg-slice-1', 'bg-slice-2', 'bg-slice-3', 'bg-slice-4', 'bg-slice-5'];
const colorOf = (slice: Slice, index: number) =>
  slice.key === 'other'
    ? { fill: 'fill-slice-other', swatch: 'bg-slice-other' }
    : { fill: FILLS[index] ?? 'fill-slice-other', swatch: SWATCHES[index] ?? 'bg-slice-other' };

/**
 * The ring of shares with every category's name, amount and share listed under it, so nothing
 * depends on telling colors apart or on hovering. Pointing at a slice or a row highlights both.
 */
export function SpendingDonut({
  slices,
  total,
  currency,
}: {
  slices: readonly Slice[];
  total: bigint;
  currency: CurrencyCode;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<string>();
  const amount = (minor: bigint) => formatMoney(money(minor, currency));
  const share = (minor: bigint) =>
    total > 0n ? formatPercent(Number((minor * 10_000n) / total) / 10_000, { signed: false }) : '';
  const name = (s: Slice) =>
    s.key === 'other' ? t('dashboard.spendingOther', { count: s.count ?? 0 }) : s.name;
  const focused = slices.find((s) => s.key === active);

  return (
    <div className="grid gap-5">
      <DonutChart
        slices={slices.map((s, i) => ({ key: s.key, value: s.amount, fill: colorOf(s, i).fill }))}
        active={active}
        onActive={setActive}
      >
        <span className="text-subtle text-xs">
          {focused ? name(focused) : t('dashboard.spendingTotal')}
        </span>
        <span className="amount font-semibold text-base leading-tight">
          {amount(focused ? focused.amount : total)}
        </span>
        {focused && <span className="text-subtle text-xs">{share(focused.amount)}</span>}
      </DonutChart>
      {slices.length === 0 ? (
        <p className="text-center text-muted text-sm">{t('dashboard.spendingNone')}</p>
      ) : (
        <ul className="grid gap-1">
          {slices.map((s, i) => (
            <li
              key={s.key}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(undefined)}
              className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 ${active === s.key ? 'bg-hover' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full ${colorOf(s, i).swatch}`}
              />
              <span className="min-w-0 flex-1 truncate">{name(s)}</span>
              <span className="amount shrink-0">{amount(s.amount)}</span>
              <span className="w-11 shrink-0 text-right text-subtle">{share(s.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "16 de octubre", or "13 oct – 16 oct" for several days. */
function rangeText(from: LocalDate, to: LocalDate) {
  return from === to ? formatLongDate(from) : `${formatShortDate(from)} – ${formatShortDate(to)}`;
}

/**
 * Inicio's spending by category for today, this week, this fortnight, this month or any range.
 * This month comes with the page; the others are loaded when chosen.
 */
export function SpendingPanel({
  month,
  categories,
  today,
  currency,
  className,
}: {
  /** This month's summary, already loaded with the page. */
  month: SummaryReport;
  categories: readonly Category[];
  today: LocalDate;
  currency: CurrencyCode;
  className?: string;
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher<SpendingResult>();
  const selectId = useId();
  const [period, setPeriod] = useState<SpendingPeriod>('month');
  const monthRange = spendingRange('month', today);
  const [custom, setCustom] = useState({ from: monthRange.from as string, to: today as string });
  const customValid = DATE.test(custom.from) && DATE.test(custom.to) && custom.from <= custom.to;
  const range =
    period === 'custom' ? (customValid ? custom : undefined) : spendingRange(period, today);
  const isMonth = range?.from === monthRange.from && range?.to === monthRange.to;
  const { load } = fetcher;

  const query =
    range && !isMonth ? `/dashboard/spending?from=${range.from}&to=${range.to}` : undefined;
  useEffect(() => {
    if (query) load(query);
  }, [query, load]);

  const loaded = fetcher.data?.summary;
  const current = isMonth
    ? month
    : loaded && range && loaded.from === range.from && loaded.to === range.to
      ? loaded
      : undefined;
  // While another period loads, the last one stays on screen, dimmed.
  const shown = useRef(month);
  if (current) shown.current = current;
  const report = shown.current;
  const { slices, total } = spendingSlices(report.expensesByCategory, categories);
  const loading = !current && range !== undefined && fetcher.state !== 'idle';
  const missing = [...new Set(report.excluded.map((e) => e.currency))];

  return (
    <Panel
      title={t('dashboard.spending')}
      subtitle={range ? rangeText(range.from as LocalDate, range.to as LocalDate) : undefined}
      className={className}
      action={
        <div className="relative shrink-0">
          <label htmlFor={selectId} className="sr-only">
            {t('dashboard.spendingPeriod')}
          </label>
          <select
            id={selectId}
            value={period}
            onChange={(e) => setPeriod(e.target.value as SpendingPeriod)}
            className="h-11 appearance-none rounded-lg border border-line bg-surface pr-9 pl-3 text-sm transition-colors duration-150 hover:border-subtle"
          >
            {SPENDING_PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`dashboard.spendingPeriods.${p}`)}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
          />
        </div>
      }
    >
      <div className="grid gap-5">
        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t('dashboard.spendingFrom')}
              type="date"
              value={custom.from}
              max={custom.to || undefined}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              error={
                DATE.test(custom.from) && DATE.test(custom.to) && custom.from > custom.to
                  ? t('dashboard.spendingRangeInvalid')
                  : undefined
              }
            />
            <TextField
              label={t('dashboard.spendingTo')}
              type="date"
              value={custom.to}
              min={custom.from || undefined}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </div>
        )}
        <div
          aria-busy={loading || undefined}
          className={`transition-opacity duration-150 ${loading ? 'opacity-60' : ''}`}
        >
          <SpendingDonut slices={slices} total={total} currency={currency} />
        </div>
        {missing.length > 0 && (
          <p className="text-sm text-subtle">
            {t('dashboard.spendingMissingRates', { currencies: missing.join(', ') })}
          </p>
        )}
        <FailureNotice failure={fetcher.data?.failure} />
      </div>
    </Panel>
  );
}
