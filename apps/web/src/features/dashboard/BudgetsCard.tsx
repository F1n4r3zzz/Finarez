import { useTranslation } from 'react-i18next';
import { Panel } from '../../components/Panel';
import { formatMoney } from '../../lib/money';
import type { BudgetRow } from './types';

const SHOWN = 4;

/** This period's budgets, overspent first: how much is used and by how much one went over. */
export function BudgetsCard({ budgets }: { budgets: readonly BudgetRow[] }) {
  const { t } = useTranslation();
  const rows = [...budgets]
    .sort((a, b) => Number(b.overspent) - Number(a.overspent))
    .slice(0, SHOWN);
  return (
    <Panel
      title={t('modules.budgets.title')}
      link={{ to: '/budgets', label: t('dashboard.seeAllMany') }}
    >
      <ul className="grid gap-4">
        {rows.map((b) => {
          const available = b.available.amountMinor;
          const share =
            available > 0n ? Math.min(Number(b.spent.amountMinor) / Number(available), 1) : 1;
          const over = b.spent.amountMinor - available;
          return (
            <li key={b.id} className="grid gap-1.5">
              <div className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{b.name}</span>
                {b.overspent ? (
                  <span className="whitespace-nowrap font-semibold text-expense">
                    {t('dashboard.budgetOver', {
                      amount: formatMoney({ amountMinor: over, currency: b.spent.currency }),
                    })}
                  </span>
                ) : (
                  <span className="whitespace-nowrap text-muted">
                    {t('dashboard.budgetOf', {
                      spent: formatMoney(b.spent),
                      available: formatMoney(b.available),
                    })}
                  </span>
                )}
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-bar-track">
                <div
                  className={`h-full rounded-full ${b.overspent ? 'bg-expense-mark' : 'bg-brand'}`}
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
