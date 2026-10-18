import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Amount } from '../../components/Amount';
import { Monogram } from '../../components/Monogram';
import { formatMoney } from '../../lib/money';
import type { AccountTile } from './types';

/** On desktop the row holds five tiles; past that, a tile leads to every account. */
const DESKTOP_TILES = 5;

const TILE =
  'flex w-[9.75rem] shrink-0 flex-col gap-3 rounded-[20px] border border-line bg-surface p-3.5 lg:w-auto lg:gap-3.5 lg:rounded-[22px] lg:p-[1.125rem]';

/** Every account as a tile in its own currency; a row that scrolls sideways on phones. */
export function AccountTiles({ accounts }: { accounts: readonly AccountTile[] }) {
  const { t } = useTranslation();
  const more = accounts.length > DESKTOP_TILES;
  return (
    <section
      aria-label={t('dashboard.tiles')}
      className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3.5 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {accounts.map((a, index) => (
        <Link
          key={a.id}
          to={`/transactions?account=${a.id}`}
          className={`${TILE} min-h-[8.25rem] transition-colors duration-150 hover:border-brand lg:min-h-[9.375rem] ${
            more && index >= DESKTOP_TILES - 1 ? 'lg:hidden' : ''
          }`}
        >
          <span className="flex flex-col items-start gap-2 lg:flex-row lg:gap-2.5">
            <Monogram name={a.name} tone={a.debt ? 'debt' : 'neutral'} size="sm" />
            <span className="min-w-0">
              <span className="line-clamp-2 block font-semibold text-sm leading-tight lg:text-base">
                {a.name}
              </span>
              <span className="block truncate text-muted text-xs lg:text-sm">
                {a.debt ? t('dashboard.debtKind') : a.kind}
              </span>
            </span>
          </span>
          <Amount
            value={a.balance}
            className={`mt-auto lg:text-[1.375rem] ${
              // Ten digits and up don't fit a phone tile at the usual size.
              formatMoney(a.balance).length > 13 ? 'text-base' : 'text-lg'
            } ${a.debt ? 'text-expense' : ''}`}
          />
        </Link>
      ))}
      {more && (
        <Link
          to="/accounts"
          className={`${TILE} hidden items-center justify-center font-semibold text-brand hover:border-brand lg:flex`}
        >
          {t('dashboard.allAccounts', { count: accounts.length })}
        </Link>
      )}
    </section>
  );
}
