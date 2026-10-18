import type { Money } from '@finanz/kernel';
import { ArrowDownLeft, ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../../components/Panel';
import { formatMoney } from '../../lib/money';
import { formatPercent } from '../../lib/percent';
import { monthFigures } from './month';
import type { MonthTotals, Pace } from './types';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
const magnitude = (value: Money): Money => ({
  amountMinor: value.amountMinor < 0n ? -value.amountMinor : value.amountMinor,
  currency: value.currency,
});

/** This month: a ring of what came in that is already spent, both totals and the pace. */
export function MonthCard({ month, pace }: { month: MonthTotals; pace?: Pace }) {
  const { t } = useTranslation();
  const figures = monthFigures(month.income.amountMinor, month.expenses.amountMinor);
  const currency = month.income.currency;
  const label =
    figures.state === 'left'
      ? t('dashboard.ringLeft', { share: formatPercent(figures.spentShare, { signed: false }) })
      : t(figures.state === 'over' ? 'dashboard.ringOver' : 'dashboard.ringEmpty');
  const center = {
    left: 'dashboard.ringLeftCenter',
    over: 'dashboard.ringOverCenter',
    empty: 'dashboard.ringEmptyCenter',
  } as const;
  const more = pace && pace.delta.amountMinor > 0n;

  return (
    <Panel
      title={capitalize(month.monthName)}
      link={{ to: '/reports', label: t('modules.reports.title') }}
    >
      <div className="flex items-center gap-5">
        <svg
          viewBox="0 0 132 132"
          role="img"
          aria-label={label}
          className="size-[7.25rem] shrink-0 lg:size-[8.25rem]"
        >
          <circle
            cx="66"
            cy="66"
            r={RADIUS}
            fill="none"
            strokeWidth="14"
            className="stroke-bar-track"
          />
          {figures.state !== 'empty' && (
            <circle
              cx="66"
              cy="66"
              r={RADIUS}
              fill="none"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${figures.spentShare * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              transform="rotate(-90 66 66)"
              className={figures.state === 'over' ? 'stroke-expense-mark' : 'stroke-brand'}
            />
          )}
          <text
            x="66"
            y={figures.state === 'empty' ? 70 : 60}
            textAnchor="middle"
            className="fill-muted text-[12px]"
          >
            {t(center[figures.state])}
          </text>
          {figures.state !== 'empty' && (
            <text x="66" y="80" textAnchor="middle" className="amount fill-ink text-[15px]">
              {formatMoney(magnitude({ amountMinor: figures.remaining, currency }))}
            </text>
          )}
        </svg>
        <dl className="grid flex-1 gap-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-income-soft text-income">
              <ArrowDownLeft size={16} strokeWidth={2.4} aria-hidden="true" />
            </span>
            <div>
              <dt className="text-muted text-sm">{t('dashboard.cameIn')}</dt>
              <dd className="amount text-[1.0625rem]">{formatMoney(month.income)}</dd>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-expense-soft text-expense">
              <ArrowUpRight size={16} strokeWidth={2.4} aria-hidden="true" />
            </span>
            <div>
              <dt className="text-muted text-sm">{t('dashboard.wentOut')}</dt>
              <dd className="amount text-[1.0625rem]">{formatMoney(month.expenses)}</dd>
            </div>
          </div>
        </dl>
      </div>
      {pace && (
        <p
          className={`mt-4 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-sm ${
            more ? 'bg-expense-soft text-expense-strong' : 'bg-brand-soft text-brand'
          }`}
        >
          {more ? (
            <TrendingUp size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          ) : (
            <TrendingDown size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          )}
          {t(more ? 'dashboard.paceMore' : 'dashboard.paceLess', {
            amount: formatMoney(magnitude(pace.delta)),
            month: pace.monthName,
          })}
        </p>
      )}
    </Panel>
  );
}
