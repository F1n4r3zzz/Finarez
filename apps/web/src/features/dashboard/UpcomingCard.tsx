import type { LocalDate } from '@finanz/kernel';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Panel } from '../../components/Panel';
import { formattingLocale } from '../../lib/locale';
import { formatMoney } from '../../lib/money';
import type { UpcomingItem } from './month';

function DateBadge({ date }: { date: LocalDate }) {
  const day = new Date(`${date}T00:00:00Z`);
  const month = new Intl.DateTimeFormat(formattingLocale(), { month: 'short', timeZone: 'UTC' })
    .format(day)
    .replace('.', '');
  return (
    <span className="flex h-[3.25rem] w-12 shrink-0 flex-col items-center justify-center rounded-[14px] bg-brand-soft text-brand leading-tight">
      <b className="text-[1.1875rem]">{day.getUTCDate()}</b>
      <span className="text-xs">{month}</span>
    </span>
  );
}

/** What waits for the user's OK, then recurring movements and debt payments in the next 14 days. */
export function UpcomingCard({
  items,
  today,
}: {
  items: readonly UpcomingItem[];
  today: LocalDate;
}) {
  const { t } = useTranslation();
  return (
    <Panel
      title={t('dashboard.upcoming')}
      link={{ to: '/transactions/recurring', label: t('dashboard.upcomingLink') }}
    >
      {items.length === 0 ? (
        <p className="text-muted">{t('dashboard.upcomingEmpty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const amount = item.amount && formatMoney(item.amount);
            return (
              <li key={item.key} className="flex items-center gap-3.5 py-2.5">
                <DateBadge date={item.date} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block">{item.title}</span>
                  {amount && (
                    <span className="amount block font-normal text-muted text-sm">
                      {item.date === today ? t('dashboard.upcomingToday', { amount }) : amount}
                    </span>
                  )}
                </span>
                {item.kind === 'confirm' && (
                  <Link
                    to="/transactions/recurring"
                    className="inline-flex min-h-9 items-center rounded-full bg-action px-3.5 font-semibold text-on-action text-sm"
                  >
                    {t('dashboard.upcomingConfirm')}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
