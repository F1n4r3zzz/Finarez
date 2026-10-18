import { Trans, useTranslation } from 'react-i18next';
import { InBand } from '../../app/band';
import { formatMoney } from '../../lib/money';
import { monthFigures } from './month';
import type { DashboardHero, MonthTotals } from './types';

const CHIP = 'rounded-full bg-band-chip px-3.5 py-2 text-band-muted text-sm';

/** Inicio's band: today's available money, large, with net worth and how the month goes. */
export function BandHero({ hero, month }: { hero: DashboardHero; month?: MonthTotals }) {
  const { t } = useTranslation();
  const figures = month && monthFigures(month.income.amountMinor, month.expenses.amountMinor);
  const currency = hero.available.currency;
  const remaining =
    figures &&
    formatMoney({
      amountMinor: figures.remaining < 0n ? -figures.remaining : figures.remaining,
      currency,
    });
  const b = <strong className="font-semibold text-on-band" />;
  return (
    <InBand>
      <div className="pt-6 lg:pt-10">
        <h1 className="sr-only">{t('modules.dashboard.title')}</h1>
        <p className="text-band-muted lg:text-lg">{t('dashboard.available')}</p>
        <p className="amount mt-1 font-semibold text-5xl text-on-band leading-none tracking-tight lg:text-[4.75rem]">
          {formatMoney(hero.available)}
        </p>
        <p className="mt-4 flex flex-wrap gap-2.5 lg:mt-5">
          <span className={CHIP}>
            <Trans
              i18nKey="dashboard.netWorthChip"
              values={{ amount: formatMoney(hero.netWorth) }}
              components={{ b }}
            />
          </span>
          {figures && figures.state !== 'empty' && month && (
            <span className={CHIP}>
              <Trans
                i18nKey={figures.state === 'left' ? 'dashboard.leftChip' : 'dashboard.overChip'}
                values={{ month: month.monthName, amount: remaining }}
                components={{ b }}
              />
            </span>
          )}
        </p>
      </div>
    </InBand>
  );
}
