import type { LocalDate, Money } from '@finanz/kernel';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Amount } from '../../components/Amount';
import { Guilloche } from '../../components/Guilloche';
import { Panel } from '../../components/Panel';
import { formatMonthName, formatShortDate } from '../../lib/dates';
import { formatMoney } from '../../lib/money';

export interface DashboardSummary {
  available: Money;
  monthIncome: Money;
  monthExpenses: Money;
  /** Any date in the month the income and expenses refer to. */
  month: LocalDate;
}

export interface AccountRow {
  id: string;
  name: string;
  detail: string;
  balance: Money;
}

export interface RecentRow {
  id: string;
  date: LocalDate;
  description: string;
  category: string;
  amount: Money;
}

interface DashboardViewProps {
  summary?: DashboardSummary;
  accounts?: readonly AccountRow[];
  recent?: readonly RecentRow[];
}

function BalanceHero({ summary }: { summary?: DashboardSummary }) {
  const { t } = useTranslation();
  const month = summary ? formatMonthName(summary.month) : '';
  return (
    <section
      aria-labelledby="available-label"
      className="relative overflow-hidden rounded-2xl bg-hero px-6 py-8 text-hero-ink md:px-10 md:py-11"
    >
      <Guilloche className="pointer-events-none absolute inset-0 h-full w-full text-hero-line [mask-image:linear-gradient(to_right,transparent_15%,black_70%)]" />
      <div className="relative">
        <p id="available-label" className="text-hero-muted">
          {t('dashboard.available')}
        </p>
        {summary ? (
          <p className="amount mt-1 text-5xl leading-none md:text-7xl">
            {formatMoney(summary.available)}
          </p>
        ) : (
          <p className="mt-3 max-w-lg text-2xl leading-snug font-medium md:text-3xl">
            {t('dashboard.availableEmpty')}
          </p>
        )}
        {summary && (
          <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-4">
            <div>
              <dt className="text-hero-muted text-sm">{t('dashboard.monthIn', { month })}</dt>
              <dd className="amount mt-0.5 text-2xl md:text-3xl">
                {formatMoney(summary.monthIncome, { signDisplay: 'exceptZero' })}
              </dd>
            </div>
            <div>
              <dt className="text-hero-muted text-sm">{t('dashboard.monthOut', { month })}</dt>
              <dd className="amount mt-0.5 text-2xl md:text-3xl">
                {formatMoney(summary.monthExpenses, { signDisplay: 'exceptZero' })}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}

const STEPS = [
  { key: 'accounts', to: '/accounts' },
  { key: 'transactions', to: '/transactions' },
  { key: 'budgets', to: '/budgets' },
] as const;

function FirstSteps() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="first-steps" className="mt-10">
      <h2 id="first-steps" className="text-xl font-semibold">
        {t('dashboard.firstSteps')}
      </h2>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.key}>
            <Link
              to={step.to}
              className="flex h-full gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand"
            >
              <span
                aria-hidden="true"
                className="amount flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
              >
                {index + 1}
              </span>
              <span>
                <span className="block font-semibold">
                  {t(`dashboard.steps.${step.key}.title`)}
                </span>
                <span className="mt-1 block text-muted text-sm">
                  {t(`dashboard.steps.${step.key}.body`)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DashboardView({ summary, accounts = [], recent = [] }: DashboardViewProps) {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="sr-only">{t('modules.dashboard.title')}</h1>
      <BalanceHero summary={summary} />
      {!summary && <FirstSteps />}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Panel
          title={t('modules.accounts.title')}
          link={{ to: '/accounts', label: t('dashboard.seeAllAccounts') }}
        >
          {accounts.length === 0 ? (
            <p className="text-muted">{t('dashboard.accountsEmpty')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block truncate text-muted text-sm">{a.detail}</span>
                  </span>
                  <Amount value={a.balance} className="text-lg" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title={t('dashboard.recent')}
          link={{ to: '/transactions', label: t('dashboard.seeAllTransactions') }}
        >
          {recent.length === 0 ? (
            <p className="text-muted">{t('dashboard.recentEmpty')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-baseline gap-3 py-3"
                >
                  <span className="text-muted text-sm">{formatShortDate(r.date)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.description}</span>
                    <span className="block truncate text-muted text-sm">{r.category}</span>
                  </span>
                  <Amount value={r.amount} signed className="text-lg" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
