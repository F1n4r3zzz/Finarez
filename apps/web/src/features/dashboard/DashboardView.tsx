import type { LocalDate, Money } from '@finanz/kernel';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Amount } from '../../components/Amount';
import { Panel } from '../../components/Panel';
import { formatMonthName, formatShortDate } from '../../lib/dates';
import { type DashboardSummary, SummaryCards } from './SummaryCards';

export type { DashboardSummary, MonthTotals } from './SummaryCards';

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
  /** Category name, or "From → To" for a transfer. */
  category: string;
  amount: Money;
  /** Money moved between the user's own accounts: shown without a sign or color. */
  transfer?: boolean;
}

interface DashboardViewProps {
  summary?: DashboardSummary;
  accounts?: readonly AccountRow[];
  recent?: readonly RecentRow[];
  /** The spending-by-category panel (it loads its own periods). */
  spending?: ReactNode;
  /** Shown under the page title, e.g. that the app is still being built. */
  notice?: ReactNode;
}

const STEPS = [
  { key: 'accounts', to: '/accounts' },
  { key: 'transactions', to: '/transactions' },
  { key: 'budgets', to: '/budgets' },
] as const;

function Onboarding() {
  const { t } = useTranslation();
  return (
    <>
      <section
        aria-labelledby="available-label"
        className="rounded-xl border border-line bg-surface p-6 md:p-8"
      >
        <p id="available-label" className="text-muted">
          {t('dashboard.available')}
        </p>
        <p className="mt-2 max-w-xl text-xl font-medium md:text-2xl">
          {t('dashboard.availableEmpty')}
        </p>
      </section>
      <section aria-labelledby="first-steps" className="mt-8">
        <h2 id="first-steps" className="text-lg font-semibold">
          {t('dashboard.firstSteps')}
        </h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.key}>
              <Link
                to={step.to}
                className="group flex h-full items-start gap-4 rounded-xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-brand"
              >
                <span
                  aria-hidden="true"
                  className="amount flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {t(`dashboard.steps.${step.key}.title`)}
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    {t(`dashboard.steps.${step.key}.body`)}
                  </span>
                </span>
                <ChevronRight
                  size={18}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-subtle transition-colors group-hover:text-brand"
                />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export function DashboardView({
  summary,
  accounts = [],
  recent = [],
  spending,
  notice,
}: DashboardViewProps) {
  const { t } = useTranslation();
  const subtitle = summary
    ? t('dashboard.subtitle', { month: formatMonthName(summary.current.month) })
    : t('modules.dashboard.description');

  return (
    <>
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {t('modules.dashboard.title')}
        </h1>
        <p className="mt-1 text-muted">{subtitle}</p>
      </header>
      {notice}

      {!summary ? (
        <Onboarding />
      ) : (
        <>
          <SummaryCards summary={summary} />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>{spending}</div>
            <Panel
              title={t('modules.accounts.title')}
              link={{ to: '/accounts', label: t('dashboard.seeAll') }}
            >
              <ul className="divide-y divide-line">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-sm text-subtle">{a.detail}</span>
                    </span>
                    <Amount value={a.balance} />
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel
              title={t('dashboard.recent')}
              link={{ to: '/transactions', label: t('dashboard.seeAll') }}
              className="lg:col-span-2"
            >
              {recent.length === 0 ? (
                <p className="text-muted">{t('dashboard.recentEmpty')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.map((r) => (
                    <li
                      key={r.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-2.5"
                    >
                      <span className="min-w-14 whitespace-nowrap text-sm text-subtle">
                        {formatShortDate(r.date)}
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-medium">{r.description}</span>
                        <span className="block truncate text-sm text-subtle">{r.category}</span>
                      </span>
                      <Amount value={r.amount} signed={!r.transfer} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
