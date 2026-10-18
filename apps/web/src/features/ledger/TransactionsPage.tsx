import type { AccountView, Category, TransactionView } from '@finanz/contracts';
import { fromWire, type LocalDate, type Money, money } from '@finanz/kernel';
import { Plus, Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Form, Link, type LoaderFunctionArgs, useLoaderData, useSubmit } from 'react-router';
import { moduleById } from '../../app/modules';
import { ActionLink } from '../../components/ActionLink';
import { Amount } from '../../components/Amount';
import { EmptyState } from '../../components/EmptyState';
import { SelectField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { formatLongDate } from '../../lib/dates';
import { listAccounts, listCategories, listTransactions } from './api';

export async function transactionsLoader({ request }: LoaderFunctionArgs) {
  const accountId = new URL(request.url).searchParams.get('account') ?? undefined;
  const [accounts, categories, transactions] = await Promise.all([
    listAccounts(),
    listCategories(),
    listTransactions({ accountId, limit: 300 }),
  ]);
  return { accounts, categories, transactions, accountId };
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

function groupByDate(list: TransactionView[]): [LocalDate, TransactionView[]][] {
  const groups = new Map<LocalDate, TransactionView[]>();
  for (const t of list) groups.set(t.occurredOn, [...(groups.get(t.occurredOn) ?? []), t]);
  return [...groups];
}

export function TransactionsPage() {
  const { t } = useTranslation();
  const { accounts, categories, transactions, accountId } =
    useLoaderData<typeof transactionsLoader>();
  const submit = useSubmit();
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        title={t('modules.transactions.title')}
        description={t('modules.transactions.description')}
        action={
          accounts.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <ActionLink to="/transactions/new" label={t('ledger.transactions.add')} />
              <Link
                to="/transactions/recurring"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium transition-colors duration-150 hover:bg-hover"
              >
                <Repeat size={18} aria-hidden="true" />
                {t('recurring.link')}
              </Link>
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
        <>
          <Form method="get" className="mb-5 sm:max-w-xs" onChange={(e) => submit(e.currentTarget)}>
            <SelectField
              label={t('ledger.transactions.account')}
              name="account"
              defaultValue={accountId ?? ''}
            >
              <option value="">{t('ledger.transactions.allAccounts')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
          </Form>

          {transactions.length === 0 ? (
            <EmptyState
              icon={moduleById('transactions').icon}
              title={t('ledger.transactions.emptyTitle')}
              body={t('ledger.transactions.emptyBody')}
            />
          ) : (
            <div className="grid gap-6">
              {groupByDate(transactions).map(([date, items]) => (
                <section key={date} aria-label={formatLongDate(date)}>
                  <h2 className="mb-2 font-medium text-muted text-sm">{formatLongDate(date)}</h2>
                  <ul className="divide-y divide-line rounded-[22px] border border-line bg-surface">
                    {items.map((item) => {
                      const d = describe(item, accountMap, categoryMap, accountId);
                      const isVoid = item.status === 'void';
                      return (
                        <li key={item.id}>
                          <Link
                            to={`/transactions/${item.id}`}
                            className={`flex min-h-16 items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-hover ${isVoid ? 'opacity-60' : ''}`}
                          >
                            <span className="min-w-0">
                              <span
                                className={`line-clamp-2 font-medium ${isVoid ? 'line-through' : ''}`}
                              >
                                {item.description}
                              </span>
                              <span className="block truncate text-sm text-subtle">
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
        </>
      )}
    </>
  );
}
