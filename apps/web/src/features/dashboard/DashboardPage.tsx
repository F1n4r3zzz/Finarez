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
import {
  getNetWorth,
  getSummary,
  listAccounts,
  listCategories,
  listTransactions,
} from '../ledger/api';
import {
  type AccountRow,
  type CategorySpend,
  DashboardView,
  type RecentRow,
} from './DashboardView';

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
  const [accounts, categories, worth, thisMonth, lastMonth, recent] = await Promise.all([
    listAccounts(),
    listCategories(),
    getNetWorth(today),
    getSummary(current.from, current.to),
    getSummary(previous.from, previous.to),
    listTransactions({ limit: 6 }),
  ]);
  return {
    accounts,
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

  if (active.length === 0) return <DashboardView />;

  const liquid = active.filter((a) => LIQUID.has(a.subtype));
  const value = new Map(worth.byAccount.map((a) => [a.accountId, BigInt(a.valueMinor)]));
  const available = liquid.reduce((sum, a) => sum + (value.get(a.id) ?? 0n), 0n);
  const missing = [
    ...new Set([worth, thisMonth, lastMonth].flatMap((r) => r.excluded.map((e) => e.currency))),
  ];
  const spending: CategorySpend[] = thisMonth.expensesByCategory
    .filter((c) => BigInt(c.amountMinor) > 0n)
    .slice(0, 5)
    .map((c) => ({
      category: data.categories.find((x) => x.id === c.categoryId)?.name ?? '',
      amount: money(BigInt(c.amountMinor), currency),
    }));
  const rows: AccountRow[] = active.slice(0, 6).map((a) => ({
    id: a.id,
    name: a.name,
    detail: a.institution ?? t(`ledger.subtypes.${a.subtype}`),
    balance: fromWire({ amountMinor: a.balanceMinor, currency: a.currency }),
  }));

  return (
    <DashboardView
      notice={
        missing.length > 0 ? (
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
        ) : undefined
      }
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
      }}
      accounts={rows}
      spending={spending}
      recent={data.recent
        .map((r) => recentRow(r, data))
        .filter((r): r is RecentRow => Boolean(r))
        .slice(0, 5)}
    />
  );
}
