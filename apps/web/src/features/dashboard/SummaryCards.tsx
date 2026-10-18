import { add, type LocalDate, type Money, negate } from '@finanz/kernel';
import {
  ArrowDown,
  ArrowUp,
  type LucideIcon,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Amount } from '../../components/Amount';
import { Sparkline } from '../../components/charts/Sparkline';
import { type Delta, DeltaBadge } from '../../components/Stat';
import { formatMonthName } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { changeRatio } from '../../lib/percent';

export interface MonthTotals {
  /** Any date in the month. */
  month: LocalDate;
  income: Money;
  /** Negative: money that left the accounts. */
  expenses: Money;
}

export interface DashboardSummary {
  available: Money;
  accountCount: number;
  current: MonthTotals;
  previous?: MonthTotals;
  /** The last six months, oldest first, this month last (still running). Positive amounts. */
  trends?: { income: readonly bigint[]; expenses: readonly bigint[]; net: readonly bigint[] };
  /** What was available at the end of each of the last 30 days, once loaded. */
  availableTrend?: readonly bigint[];
}

const TONES = { brand: 'text-brand', income: 'text-income', expense: 'text-expense' } as const;

function Card({
  label,
  icon: Icon,
  tone,
  value,
  footer,
  trend,
  partialLast = false,
}: {
  label: string;
  icon: LucideIcon;
  tone: keyof typeof TONES;
  value: ReactNode;
  /** The change vs. last month, or a short caption. */
  footer: ReactNode;
  trend?: readonly bigint[];
  partialLast?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-[22px] border border-line bg-surface p-4 md:p-5">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <p className="text-muted text-sm">{label}</p>
          <Icon size={20} aria-hidden="true" className={`shrink-0 ${TONES[tone]}`} />
        </div>
        <p className="amount mt-3 truncate text-lg sm:text-xl xl:text-2xl">{value}</p>
        <div className="mt-2 min-w-0">{footer}</div>
        {/* Every card keeps the line's place, so they line up even before a trend loads. */}
        <div className="mt-auto pt-4">
          {trend ? (
            <Sparkline
              values={trend}
              partialLast={partialLast}
              stretch
              className={`h-8 w-full ${TONES[tone]}`}
            />
          ) : (
            <div aria-hidden="true" className="h-8" />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The four figures that open Inicio: what is available today and this month's income, spending
 * and balance, each with its trend (the last 30 days, or the last six months with this one
 * still running).
 */
export function SummaryCards({ summary }: { summary: DashboardSummary }) {
  const { t } = useTranslation();
  const { current, previous, trends } = summary;
  const month = formatMonthName(current.month);
  const versus = previous ? t('dashboard.versus', { month: formatMonthName(previous.month) }) : '';
  const net: Money = add(current.income, current.expenses);
  const delta = (ratio: number | undefined, upIsGood: boolean): Delta | undefined =>
    ratio === undefined ? undefined : { ratio, label: versus, upIsGood };
  const change = (now: Money, before: Money | undefined, upIsGood: boolean) => {
    const d = before ? delta(changeRatio(now, before), upIsGood) : undefined;
    return d ? <DeltaBadge delta={d} as="p" /> : null;
  };
  const caption = (text: string) => <p className="text-sm text-subtle">{text}</p>;
  const positive = net.amountMinor >= 0n;

  return (
    <section
      aria-label={t('dashboard.summary')}
      className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"
    >
      <Card
        label={t('dashboard.available')}
        icon={Wallet}
        tone="brand"
        value={formatMoney(summary.available)}
        footer={caption(t('dashboard.inAccounts', { count: summary.accountCount }))}
        trend={summary.availableTrend}
      />
      <Card
        label={t('dashboard.income', { month })}
        icon={ArrowUp}
        tone="income"
        value={formatMoney(current.income)}
        footer={change(current.income, previous?.income, true)}
        trend={trends?.income}
        partialLast
      />
      <Card
        label={t('dashboard.expenses', { month })}
        icon={ArrowDown}
        tone="expense"
        value={formatMoney(negate(current.expenses))}
        footer={change(current.expenses, previous?.expenses, false)}
        trend={trends?.expenses}
        partialLast
      />
      <Card
        label={t('dashboard.net', { month })}
        icon={positive ? TrendingUp : TrendingDown}
        tone={positive ? 'income' : 'expense'}
        value={<Amount value={net} signed />}
        footer={caption(t('dashboard.netCaption'))}
        trend={trends?.net}
        partialLast
      />
    </section>
  );
}
