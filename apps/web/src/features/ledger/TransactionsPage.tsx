import type {
  AccountView,
  Category,
  OccurrenceView,
  Preferences,
  TransactionView,
} from '@finanz/contracts';
import {
  type CurrencyCode,
  fromWire,
  type LocalDate,
  type Money,
  money,
  parseLocalDate,
  todayIn,
} from '@finanz/kernel';
import { ArrowLeftRight, FileUp, Plus, Repeat, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
  useLoaderData,
  useSearchParams,
} from 'react-router';
import { useBandOverlap } from '../../app/band';
import { moduleById } from '../../app/modules';
import { BandLink } from '../../components/ActionLink';
import { Amount } from '../../components/Amount';
import { EmptyState } from '../../components/EmptyState';
import { Monogram } from '../../components/Monogram';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { dayHeading, formatMonthName, formatShortDate } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { listPending } from '../recurring/api';
import { listAccounts, listCategories, listTransactions } from './api';

/** Movements asked for per period; the API's maximum. */
const LIMIT = 500;

type Period = 'month' | 'last' | 'custom';

const isDate = (value: string | null): value is string =>
  value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

function monthOf(day: LocalDate, monthsBack = 0) {
  const [y, m] = day.split('-').map(Number) as [number, number];
  const iso = (d: Date) => parseLocalDate(d.toISOString().slice(0, 10));
  return {
    from: iso(new Date(Date.UTC(y, m - 1 - monthsBack, 1))),
    to: iso(new Date(Date.UTC(y, m - monthsBack, 0))),
  };
}

/** The period in the address: this month unless it says last month or valid custom dates. */
function readPeriod(params: URLSearchParams, today: LocalDate) {
  const asked = params.get('period');
  const from = params.get('from');
  const to = params.get('to');
  if (asked === 'custom' && isDate(from) && isDate(to) && from <= to) {
    return { period: 'custom' as Period, from: parseLocalDate(from), to: parseLocalDate(to) };
  }
  if (asked === 'last') return { period: 'last' as Period, ...monthOf(today, 1) };
  return { period: (asked === 'custom' ? 'custom' : 'month') as Period, ...monthOf(today) };
}

export async function transactionsLoader({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams;
  const accountId = params.get('account') ?? undefined;
  const preferences = await api<Preferences>('GET', '/me/preferences');
  const today = todayIn(preferences.timeZone);
  const { period, from, to } = readPeriod(params, today);
  const [accounts, categories, transactions, pending] = await Promise.all([
    listAccounts(),
    listCategories(),
    listTransactions({ accountId, from, to, limit: LIMIT }),
    listPending(),
  ]);
  return {
    accounts,
    categories,
    transactions,
    pending,
    accountId,
    period,
    from,
    to,
    today,
    currency: preferences.primaryCurrency as CurrencyCode,
  };
}

/** Category and search narrow what is already loaded, so they never ask the API again. */
const LOCAL_FILTERS = new Set(['cat', 'q']);

export function transactionsShouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
  const rest = (url: URL) =>
    [...url.searchParams].filter(([key]) => !LOCAL_FILTERS.has(key)).join('&');
  return rest(currentUrl) === rest(nextUrl) ? false : defaultShouldRevalidate;
}

const userLegs = (t: TransactionView) =>
  t.entries.filter((e) => e.accountKind === 'asset' || e.accountKind === 'liability');

/** One line of the list: what it was, where, and how much moved. */
function describe(
  t: TransactionView,
  accounts: Map<string, AccountView>,
  categories: Map<string, Category>,
  focus?: string,
) {
  const legs = userLegs(t);
  const name = (id?: string) => (id ? (accounts.get(id)?.name ?? '') : '');
  const categoryNames = t.entries
    .filter((e) => e.categoryId)
    .map((e) => categories.get(e.categoryId ?? '')?.name ?? '');
  const from = legs.find((l) => BigInt(l.amountMinor) < 0n);
  const to = legs.find((l) => BigInt(l.amountMinor) > 0n);
  const shown = (focus ? legs.find((l) => l.accountId === focus) : undefined) ?? legs[0];
  return {
    isTransfer: legs.length > 1,
    detail: legs.length > 1 ? { from: name(from?.accountId), to: name(to?.accountId) } : undefined,
    categories: categoryNames,
    account: name(shown?.accountId),
    amount: shown
      ? fromWire({ amountMinor: shown.amountMinor, currency: shown.currency })
      : undefined,
  };
}

const abs = (value: Money) =>
  value.amountMinor < 0n ? money(-value.amountMinor, value.currency) : value;

/** Accents and case don't matter when searching ("Éxito" finds "exito"). */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es');

function groupByDate(list: TransactionView[]): [LocalDate, TransactionView[]][] {
  const groups = new Map<LocalDate, TransactionView[]>();
  for (const t of list) groups.set(t.occurredOn, [...(groups.get(t.occurredOn) ?? []), t]);
  return [...groups];
}

/** Money in and out of what is shown, per currency; transfers between own accounts are neither. */
function totals(list: TransactionView[]) {
  const sums = new Map<CurrencyCode, { in: bigint; out: bigint }>();
  for (const t of list) {
    const legs = userLegs(t);
    if (t.status === 'void' || legs.length !== 1) continue;
    const [leg] = legs;
    if (!leg) continue;
    const amount = BigInt(leg.amountMinor);
    const sum = sums.get(leg.currency) ?? { in: 0n, out: 0n };
    if (amount > 0n) sum.in += amount;
    else sum.out -= amount;
    sums.set(leg.currency, sum);
  }
  return sums;
}

const FILTER_PILL =
  'inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 font-medium text-sm transition-colors duration-150';
const pill = (pressed: boolean) =>
  `${FILTER_PILL} ${pressed ? 'border-action bg-action text-on-action' : 'border-line-strong bg-surface hover:bg-hover'}`;
const FILTER_SELECT =
  'min-h-10 rounded-full border border-line-strong bg-surface px-3.5 font-medium text-sm';

function PendingGroup({ pending }: { pending: readonly OccurrenceView[] }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t('ledger.transactions.pending')}>
      <h2 className="mb-1 font-semibold text-muted text-sm">{t('ledger.transactions.pending')}</h2>
      <ul className="divide-y divide-line">
        {pending.map((o) => (
          <li key={`${o.ruleId}-${o.dueOn}`}>
            <Link
              to="/transactions/recurring"
              className="flex min-h-16 items-center gap-3.5 py-3 transition-colors duration-150 hover:bg-hover"
            >
              <Monogram name={o.description} icon={<Repeat size={18} />} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block font-semibold">{o.description}</span>
                <span className="block truncate text-muted text-sm">
                  {t('ledger.transactions.pendingDetail', { date: formatShortDate(o.dueOn) })}
                </span>
              </span>
              <span className="hidden rounded-full bg-action px-3.5 py-2 font-semibold text-on-action text-sm sm:inline">
                {t('ledger.transactions.confirm')}
              </span>
              {o.amountMinor !== null && (
                <span className="amount whitespace-nowrap">
                  {formatMoney(money(BigInt(o.amountMinor), o.currency))}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function List() {
  const { t } = useTranslation();
  useBandOverlap();
  const data = useLoaderData<typeof transactionsLoader>();
  const { accounts, categories, transactions, accountId, period, from, to, today } = data;
  const [params, setParams] = useSearchParams();
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const categoryFilter = params.get('cat') ?? '';
  const query = fold(params.get('q') ?? '').trim();

  const update = (changes: Record<string, string | null>, replace = false) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace, preventScrollReset: true },
    );

  const matchesCategory = (item: TransactionView) =>
    !categoryFilter ||
    item.entries.some(
      (e) =>
        e.categoryId === categoryFilter ||
        (e.categoryId && categoryMap.get(e.categoryId)?.parentId === categoryFilter),
    );
  const matchesQuery = (item: TransactionView) => {
    if (!query) return true;
    const names = item.entries.map((e) => categoryMap.get(e.categoryId ?? '')?.name ?? '');
    return fold([item.description, item.payee ?? '', ...names].join(' ')).includes(query);
  };
  const shown = transactions.filter((item) => matchesCategory(item) && matchesQuery(item));
  const sums = totals(shown);
  const [single] = sums.size === 1 ? [...sums] : [];
  const pending = period === 'month' && !accountId && !categoryFilter && !query ? data.pending : [];
  const roots = categories.filter((c) => !c.parentId && !c.archived);

  return (
    <div className="grid gap-4 rounded-[22px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative min-w-0 flex-[1_1_16rem]">
          <span className="sr-only">{t('ledger.transactions.search')}</span>
          <Search
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            defaultValue={params.get('q') ?? ''}
            placeholder={t('ledger.transactions.searchPlaceholder')}
            onChange={(e) => update({ q: e.currentTarget.value }, true)}
            className="h-12 w-full rounded-[14px] border border-line-strong bg-field pr-3.5 pl-10 text-base"
          />
        </label>
        <div className="relative -mx-5 flex min-w-0 shrink-0 basis-[calc(100%+2.5rem)] gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:shrink sm:basis-auto sm:flex-wrap sm:overflow-visible sm:px-0">
          <button
            type="button"
            aria-pressed={period === 'month'}
            onClick={() => update({ period: null, from: null, to: null })}
            className={pill(period === 'month')}
          >
            {t('ledger.transactions.thisMonth')}
          </button>
          <button
            type="button"
            aria-pressed={period === 'last'}
            onClick={() => update({ period: 'last', from: null, to: null })}
            className={pill(period === 'last')}
          >
            {t('ledger.transactions.lastMonth')}
          </button>
          <button
            type="button"
            aria-pressed={period === 'custom'}
            onClick={() => update({ period: 'custom', from, to })}
            className={pill(period === 'custom')}
          >
            {t('ledger.transactions.pickDates')}
          </button>
          <label className="shrink-0">
            <span className="sr-only">{t('ledger.transactions.account')}</span>
            <select
              value={accountId ?? ''}
              onChange={(e) => update({ account: e.currentTarget.value })}
              className={FILTER_SELECT}
            >
              <option value="">{t('ledger.transactions.allAccounts')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="shrink-0">
            <span className="sr-only">{t('ledger.transactions.category')}</span>
            <select
              value={categoryFilter}
              onChange={(e) => update({ cat: e.currentTarget.value }, true)}
              className={FILTER_SELECT}
            >
              <option value="">{t('ledger.transactions.allCategories')}</option>
              {roots.map((root) => [
                <option key={root.id} value={root.id}>
                  {root.name}
                </option>,
                ...categories
                  .filter((c) => c.parentId === root.id && !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {`— ${c.name}`}
                    </option>
                  )),
              ])}
            </select>
          </label>
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap gap-2.5">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{t('ledger.transactions.from')}</span>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => update({ from: e.currentTarget.value })}
                className="h-11 rounded-[14px] border border-line-strong bg-field px-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{t('ledger.transactions.to')}</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => update({ to: e.currentTarget.value })}
                className="h-11 rounded-[14px] border border-line-strong bg-field px-3"
              />
            </label>
          </div>
        )}
      </div>

      {/* A calculated result: announced politely when a filter changes it. */}
      <output
        aria-label={t('ledger.transactions.totals')}
        className="flex flex-wrap gap-x-7 gap-y-1 text-muted text-sm"
      >
        <span>{t('ledger.transactions.count', { count: shown.length })}</span>
        {single && (
          <>
            {' '}
            <span>
              {t('ledger.transactions.cameIn')}{' '}
              <strong className="amount text-ink">
                {formatMoney(money(single[1].in, single[0]))}
              </strong>
            </span>{' '}
            <span>
              {t('ledger.transactions.wentOut')}{' '}
              <strong className="amount text-ink">
                {formatMoney(money(single[1].out, single[0]))}
              </strong>
            </span>{' '}
            <span>
              {t('ledger.transactions.net')}{' '}
              <strong
                className={`amount ${single[1].in > single[1].out ? 'text-income' : 'text-ink'}`}
              >
                {formatMoney(money(single[1].in - single[1].out, single[0]), {
                  signDisplay: 'exceptZero',
                })}
              </strong>
            </span>
          </>
        )}
      </output>

      {pending.length > 0 && <PendingGroup pending={pending} />}

      {shown.length === 0 ? (
        <p className="py-6 text-center text-muted">
          {transactions.length === 0
            ? t('ledger.transactions.emptyBody')
            : t('ledger.transactions.noneInPeriod')}
        </p>
      ) : (
        <div className="grid gap-5">
          {groupByDate(shown).map(([date, items]) => (
            <section key={date} aria-label={dayHeading(date, today)}>
              <h2 className="mb-1 font-semibold text-muted text-sm">{dayHeading(date, today)}</h2>
              <ul className="divide-y divide-line">
                {items.map((item) => {
                  const d = describe(item, accountMap, categoryMap, accountId);
                  const isVoid = item.status === 'void';
                  const income = !d.isTransfer && (d.amount?.amountMinor ?? 0n) > 0n;
                  return (
                    <li key={item.id}>
                      <Link
                        to={`/transactions/${item.id}`}
                        className={`flex min-h-16 items-center gap-3.5 py-3 transition-colors duration-150 hover:bg-hover ${isVoid ? 'opacity-60' : ''}`}
                      >
                        <Monogram
                          name={d.categories[0] || item.description}
                          tone={d.isTransfer ? 'plain' : income ? 'income' : 'neutral'}
                          icon={d.isTransfer ? <ArrowLeftRight size={18} /> : undefined}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`line-clamp-2 block font-semibold ${isVoid ? 'line-through' : ''}`}
                          >
                            {item.description}
                          </span>
                          <span className="block truncate text-muted text-sm">
                            {isVoid
                              ? t('ledger.transactions.void')
                              : d.detail
                                ? t('ledger.transactions.transfer', d.detail)
                                : d.categories.length > 1
                                  ? `${d.account}, ${t('ledger.transactions.split', { count: d.categories.length })}`
                                  : [d.categories[0], d.account].filter(Boolean).join(', ')}
                          </span>
                        </span>
                        {d.amount && !isVoid && (
                          <Amount
                            // A transfer seen from no account in particular: just how much moved.
                            value={d.isTransfer && !accountId ? abs(d.amount) : d.amount}
                            signed={!d.isTransfer || Boolean(accountId)}
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {transactions.length === LIMIT && (
        <p className="text-muted text-sm">{t('ledger.transactions.limitNote', { count: LIMIT })}</p>
      )}
    </div>
  );
}

/** "Octubre de 2026" for a month, "1 mar – 15 mar" for chosen dates. */
function periodName(period: Period, from: LocalDate, to: LocalDate) {
  if (period === 'custom') return `${formatShortDate(from)} – ${formatShortDate(to)}`;
  const name = `${formatMonthName(from)} de ${from.slice(0, 4)}`;
  return name.charAt(0).toLocaleUpperCase('es') + name.slice(1);
}

export function TransactionsPage() {
  const { t } = useTranslation();
  const { accounts, transactions, period, from, to, currency } =
    useLoaderData<typeof transactionsLoader>();
  const sums = totals(transactions).get(currency);

  return (
    <>
      <PageHeader
        title={t('modules.transactions.title')}
        description={
          sums
            ? t('ledger.transactions.summary', {
                period: periodName(period, from, to),
                income: formatMoney(money(sums.in, currency)),
                expenses: formatMoney(money(sums.out, currency)),
              })
            : t('modules.transactions.description')
        }
        action={
          accounts.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <BandLink to="/transactions/recurring">
                <Repeat size={18} aria-hidden="true" />
                {t('recurring.link')}
              </BandLink>
              <BandLink to="/import">
                <FileUp size={18} aria-hidden="true" />
                {t('modules.import.title')}
              </BandLink>
            </div>
          )
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={moduleById('transactions').icon}
          title={t('ledger.transactions.emptyTitle')}
          body={t('ledger.transactions.needAccount')}
        >
          <Link
            to="/accounts/new"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action"
          >
            <Plus size={18} aria-hidden="true" />
            {t('ledger.accounts.add')}
          </Link>
        </EmptyState>
      ) : (
        <List />
      )}
    </>
  );
}
