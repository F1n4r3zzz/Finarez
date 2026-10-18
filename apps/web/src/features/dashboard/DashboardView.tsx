import type { LocalDate, Money } from '@finanz/kernel';
import { ArrowLeftRight, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useBandOverlap } from '../../app/band';
import { Amount } from '../../components/Amount';
import { Monogram } from '../../components/Monogram';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { formatShortDate } from '../../lib/dates';
import { AccountTiles } from './AccountTiles';
import { BandHero } from './BandHero';
import { BudgetsCard } from './BudgetsCard';
import { MonthCard } from './MonthCard';
import type { UpcomingItem } from './month';
import type { AccountTile, BudgetRow, DashboardHero, MonthTotals, Pace, RecentRow } from './types';
import { UpcomingCard } from './UpcomingCard';

export type {
  AccountTile,
  BudgetRow,
  DashboardHero,
  MonthTotals,
  Pace,
  RecentRow,
} from './types';

interface DashboardViewProps {
  /** Without it the user has no accounts yet and sees the first steps. */
  hero?: DashboardHero;
  accounts?: readonly AccountTile[];
  month?: MonthTotals;
  pace?: Pace;
  budgets?: readonly BudgetRow[];
  upcoming?: readonly UpcomingItem[];
  today?: LocalDate;
  /** The spending-by-category panel (it loads its own periods). */
  spending?: ReactNode;
  recent?: readonly RecentRow[];
  /** Above the cards, e.g. missing exchange rates. */
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
      <PageHeader
        title={t('modules.dashboard.title')}
        description={t('modules.dashboard.description')}
      />
      <section
        aria-labelledby="available-label"
        className="rounded-[22px] border border-line bg-surface p-6 md:p-8"
      >
        <p id="available-label" className="text-muted">
          {t('dashboard.available')}
        </p>
        <p className="mt-2 max-w-xl font-medium text-xl md:text-2xl">
          {t('dashboard.availableEmpty')}
        </p>
      </section>
      <section aria-labelledby="first-steps" className="mt-8">
        <h2 id="first-steps" className="font-semibold text-lg">
          {t('dashboard.firstSteps')}
        </h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.key}>
              <Link
                to={step.to}
                className="group flex h-full items-start gap-4 rounded-[22px] border border-line bg-surface p-5 transition-colors duration-150 hover:border-brand"
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
                  <span className="mt-1 block text-muted text-sm">
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

function RecentPanel({ recent }: { recent: readonly RecentRow[] }) {
  const { t } = useTranslation();
  return (
    <Panel
      title={t('dashboard.recent')}
      link={{ to: '/transactions', label: t('dashboard.seeAllMany') }}
    >
      {recent.length === 0 ? (
        <p className="text-muted">{t('dashboard.recentEmpty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((r) => (
            <li key={r.id} className="flex items-center gap-3.5 py-3">
              <Monogram
                name={r.category || r.description}
                tone={r.transfer ? 'plain' : r.amount.amountMinor > 0n ? 'income' : 'neutral'}
                icon={r.transfer ? <ArrowLeftRight size={18} /> : undefined}
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block font-semibold">{r.description}</span>
                <span className="block truncate text-muted text-sm">
                  {r.category
                    ? `${r.category}, ${formatShortDate(r.date)}`
                    : formatShortDate(r.date)}
                </span>
              </span>
              <Amount value={r.amount} signed={!r.transfer} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function WithData(props: DashboardViewProps & { hero: DashboardHero }) {
  useBandOverlap();
  const { hero, accounts = [], month, pace, budgets = [], upcoming = [], today, spending } = props;
  return (
    <>
      <BandHero hero={hero} month={month} />
      <div className="grid gap-4 lg:gap-[1.375rem]">
        <AccountTiles accounts={accounts} />
        {props.notice}
        <div className="grid gap-4 lg:grid-cols-3 lg:gap-[1.375rem]">
          {month && <MonthCard month={month} pace={pace} />}
          {budgets.length > 0 && <BudgetsCard budgets={budgets} />}
          <UpcomingCard items={upcoming} today={today ?? ('' as LocalDate)} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-[1.375rem]">
          <div>{spending}</div>
          <RecentPanel recent={props.recent ?? []} />
        </div>
      </div>
    </>
  );
}

/** Inicio: the balance on the band, account tiles, the month, budgets, what's next and lists. */
export function DashboardView(props: DashboardViewProps) {
  return props.hero ? <WithData {...props} hero={props.hero} /> : <Onboarding />;
}
