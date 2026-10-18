import type { Preferences, TransactionView } from '@finanz/contracts';
import {
  type CurrencyCode,
  fromWire,
  type LocalDate,
  money,
  parseLocalDate,
  todayIn,
} from '@finanz/kernel';
import { useTranslation } from 'react-i18next';
import { Link, useLoaderData } from 'react-router';
import { Notice } from '../../components/Notice';
import { api } from '../../lib/api';
import { formatMonthName } from '../../lib/dates';
import { listBudgets } from '../budgets/api';
import { listDebts } from '../debts/api';
import {
  getNetWorth,
  getSummary,
  listAccounts,
  listCategories,
  listTransactions,
} from '../ledger/api';
import { listPending, listRules } from '../recurring/api';
import {
  type AccountTile,
  type BudgetRow,
  DashboardView,
  type Pace,
  type RecentRow,
} from './DashboardView';
import { samePointLastMonth, upcomingItems } from './month';
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
  const lastMonthSoFar = samePointLastMonth(today);
  const [
    accounts,
    categories,
    worth,
    thisMonth,
    thisMonthSoFar,
    lastMonth,
    lastMonthPace,
    recent,
    pending,
    rules,
    debts,
    budgets,
  ] = await Promise.all([
    listAccounts(),
    listCategories(),
    getNetWorth(today),
    getSummary(current.from, current.to),
    // The comparison stops at today on both sides: future-dated movements don't count yet.
    getSummary(current.from, today),
    getSummary(previous.from, previous.to),
    getSummary(lastMonthSoFar.from, lastMonthSoFar.to),
    listTransactions({ limit: 6 }),
    listPending(),
    listRules(),
    listDebts(),
    listBudgets(today),
  ]);
  return {
    accounts,
    categories,
    worth,
    thisMonth,
    thisMonthSoFar,
    lastMonth,
    lastMonthPace,
    recent,
    pending,
    rules,
    debts,
    budgets,
    today,
    previousMonth: previous.to,
  };
}

type Data = Awaited<ReturnType<typeof dashboardLoader>>;

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
  const { accounts, worth, thisMonth, lastMonth, lastMonthPace, today } = data;
  const currency = worth.currency as CurrencyCode;
  const active = accounts.filter((a) => !a.archived);

  if (active.length === 0) return <DashboardView />;

  const value = new Map(worth.byAccount.map((a) => [a.accountId, BigInt(a.valueMinor)]));
  const available = active
    .filter((a) => LIQUID.has(a.subtype))
    .reduce((sum, a) => sum + (value.get(a.id) ?? 0n), 0n);
  // Budgets in another currency can leave out spending too.
  const missing = [
    ...new Set(
      [
        worth,
        thisMonth,
        lastMonth,
        ...data.budgets.flatMap((b) => (b.current ? [b.current] : [])),
      ].flatMap((r) => r.excluded.map((e) => e.currency)),
    ),
  ];
  const tiles: AccountTile[] = [...active]
    .sort((a, b) => Number(a.kind === 'liability') - Number(b.kind === 'liability'))
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.institution ?? t(`ledger.subtypes.${a.subtype}`),
      balance: fromWire({ amountMinor: a.balanceMinor, currency: a.currency }),
      debt: a.kind === 'liability',
    }));
  const categoryName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? '';
  const budgets: BudgetRow[] = data.budgets.flatMap((b) =>
    b.archived || !b.current
      ? []
      : [
          {
            id: b.id,
            name: categoryName(b.categoryId),
            spent: money(BigInt(b.current.spentMinor), b.currency),
            available: money(BigInt(b.current.availableMinor), b.currency),
            overspent: b.current.overspent,
          },
        ],
  );
  const spentNow = BigInt(thisMonth.expensesMinor);
  const spentSoFar = BigInt(data.thisMonthSoFar.expensesMinor);
  const spentThen = BigInt(lastMonthPace.expensesMinor);
  // Only against a month that had any movement, and only when there is a difference.
  const lastMonthActive =
    BigInt(lastMonth.incomeMinor) !== 0n || BigInt(lastMonth.expensesMinor) !== 0n;
  const pace: Pace | undefined =
    lastMonthActive && spentSoFar !== spentThen
      ? {
          delta: money(spentSoFar - spentThen, currency),
          monthName: formatMonthName(data.previousMonth),
        }
      : undefined;

  return (
    <DashboardView
      notice={
        missing.length > 0 && (
          <Notice tone="info">
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
        )
      }
      hero={{
        available: money(available, currency),
        netWorth: money(BigInt(worth.totalMinor), currency),
      }}
      accounts={tiles}
      month={{
        income: money(BigInt(thisMonth.incomeMinor), currency),
        expenses: money(spentNow, currency),
        monthName: formatMonthName(today),
      }}
      pace={pace}
      budgets={budgets}
      upcoming={upcomingItems({
        pending: data.pending,
        rules: data.rules,
        debts: data.debts,
        today,
      })}
      today={today}
      spending={
        <SpendingPanel
          month={thisMonth}
          categories={data.categories}
          today={today}
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
