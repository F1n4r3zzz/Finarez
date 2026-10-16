import type { Preferences, TransactionView } from '@finanz/contracts';
import {
  type CurrencyCode,
  fromWire,
  type LocalDate,
  money,
  parseLocalDate,
  todayIn,
} from '@finanz/kernel';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, type LoaderFunctionArgs, useFetcher, useLoaderData } from 'react-router';
import { Notice } from '../../components/Notice';
import { api } from '../../lib/api';
import {
  getBalances,
  getMonthly,
  getNetWorth,
  getSummary,
  listAccounts,
  listCategories,
  listTransactions,
} from '../ledger/api';
import { listPending } from '../recurring/api';
import { type AccountRow, DashboardView, type RecentRow } from './DashboardView';
import { SpendingPanel } from './SpendingPanel';

const LIQUID = new Set(['bank', 'cash', 'wallet']);

function monthRange(day: LocalDate, monthsBack = 0) {
  const [y, m] = day.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1 - monthsBack, 1));
  const last = new Date(Date.UTC(y, m - monthsBack, 0));
  const iso = (d: Date) => parseLocalDate(d.toISOString().slice(0, 10));
  return { from: iso(first), to: iso(last) };
}

export async function dashboardLoader() {
  const preferences = await api<Preferences>('GET', '/me/preferences');
  const today = todayIn(preferences.timeZone);
  const current = monthRange(today);
  const previous = monthRange(today, 1);
  const [accounts, categories, worth, thisMonth, lastMonth, recent, pending, sixMonths] =
    await Promise.all([
      listAccounts(),
      listCategories(),
      getNetWorth(today),
      getSummary(current.from, current.to),
      getSummary(previous.from, previous.to),
      listTransactions({ limit: 6 }),
      listPending(),
      getMonthly(monthRange(today, 5).from, current.to),
    ]);
  return {
    accounts,
    sixMonths,
    pending: pending.length,
    categories,
    worth,
    thisMonth,
    lastMonth,
    recent,
    today,
    previousMonth: previous.to,
  };
}

type Data = Awaited<ReturnType<typeof dashboardLoader>>;

const DAY = 86_400_000;
const daysBefore = (date: LocalDate, days: number) =>
  parseLocalDate(new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10));

/** What was available at the end of each of the last 30 days, for Inicio's first card. */
export async function availableLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const to = url.searchParams.get('to') ?? '';
  const ids = (url.searchParams.get('accounts') ?? '').split(',').filter(Boolean);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || ids.length === 0) return { days: [] as bigint[] };
  try {
    const series = await getBalances(daysBefore(to as LocalDate, 29), to, ids);
    return { days: series.days.map((d) => BigInt(d.valueMinor)) };
  } catch {
    // The trend is extra: without it the card still shows today's figure.
    return { days: [] as bigint[] };
  }
}

/** Loads the 30-day trend after the page shows, so Inicio never waits for it. */
function useAvailableTrend(accountIds: readonly string[], today: LocalDate) {
  const fetcher = useFetcher<typeof availableLoader>();
  const query = accountIds.length
    ? `/dashboard/available?to=${today}&accounts=${accountIds.join(',')}`
    : undefined;
  const { load } = fetcher;
  useEffect(() => {
    if (query) load(query);
  }, [query, load]);
  const days = fetcher.data?.days;
  return days && days.length > 1 ? days : undefined;
}

function recentRow(t: TransactionView, data: Data): RecentRow | undefined {
  const legs = t.entries.filter((e) => e.accountKind === 'asset' || e.accountKind === 'liability');
  const [leg] = legs;
  if (!leg || t.status === 'void') return undefined;
  const category = t.entries.find((e) => e.categoryId)?.categoryId;
  const name = data.categories.find((c) => c.id === category)?.name;
  const accountName = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? '';
  if (legs.length > 1) {
    const from = legs.find((l) => BigInt(l.amountMinor) < 0n) ?? leg;
    const to = legs.find((l) => BigInt(l.amountMinor) > 0n);
    const amount = fromWire({ amountMinor: from.amountMinor, currency: from.currency });
    return {
      id: t.id,
      date: t.occurredOn,
      description: t.description,
      category: `${accountName(from.accountId)} → ${accountName(to?.accountId)}`,
      amount: money(-amount.amountMinor, amount.currency),
      transfer: true,
    };
  }
  return {
    id: t.id,
    date: t.occurredOn,
    description: t.description,
    category: name ?? '',
    amount: fromWire({ amountMinor: leg.amountMinor, currency: leg.currency }),
  };
}

/** Inicio with the user's real figures, all in their primary currency. */
export function DashboardPage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof dashboardLoader>();
  const { accounts, worth, thisMonth, lastMonth } = data;
  const currency = worth.currency as CurrencyCode;
  const active = accounts.filter((a) => !a.archived);
  const liquid = active.filter((a) => LIQUID.has(a.subtype));
  const availableTrend = useAvailableTrend(
    liquid.map((a) => a.id),
    data.today,
  );

  if (active.length === 0) return <DashboardView />;

  const value = new Map(worth.byAccount.map((a) => [a.accountId, BigInt(a.valueMinor)]));
  const available = liquid.reduce((sum, a) => sum + (value.get(a.id) ?? 0n), 0n);
  const missing = [
    ...new Set([worth, thisMonth, lastMonth].flatMap((r) => r.excluded.map((e) => e.currency))),
  ];
  const rows: AccountRow[] = active.slice(0, 6).map((a) => ({
    id: a.id,
    name: a.name,
    detail: a.institution ?? t(`ledger.subtypes.${a.subtype}`),
    balance: fromWire({ amountMinor: a.balanceMinor, currency: a.currency }),
  }));

  const notices = [
    data.pending > 0 && (
      <Notice key="recurring" tone="info">
        <p>
          {t('recurring.notice', { count: data.pending })}{' '}
          <Link
            to="/transactions/recurring"
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            {t('recurring.review')}
          </Link>
        </p>
      </Notice>
    ),
    missing.length > 0 && (
      <Notice key="rates" tone="info">
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
    ),
  ].filter(Boolean);

  return (
    <DashboardView
      notice={notices.length > 0 ? <div className="mb-6 grid gap-3">{notices}</div> : undefined}
      summary={{
        available: money(available, currency),
        accountCount: liquid.length,
        current: {
          month: data.today,
          income: money(BigInt(thisMonth.incomeMinor), currency),
          expenses: money(-BigInt(thisMonth.expensesMinor), currency),
        },
        previous: {
          month: data.previousMonth,
          income: money(BigInt(lastMonth.incomeMinor), currency),
          expenses: money(-BigInt(lastMonth.expensesMinor), currency),
        },
        trends: {
          income: data.sixMonths.months.map((m) => BigInt(m.incomeMinor)),
          expenses: data.sixMonths.months.map((m) => BigInt(m.expensesMinor)),
          net: data.sixMonths.months.map((m) => BigInt(m.netMinor)),
        },
        availableTrend,
      }}
      accounts={rows}
      spending={
        <SpendingPanel
          month={thisMonth}
          categories={data.categories}
          today={data.today}
          currency={currency}
          className="h-full"
        />
      }
      recent={data.recent
        .map((r) => recentRow(r, data))
        .filter((r): r is RecentRow => Boolean(r))
        .slice(0, 5)}
    />
  );
}
