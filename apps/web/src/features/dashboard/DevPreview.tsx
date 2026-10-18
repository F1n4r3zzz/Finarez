import { parseLocalDate } from '@finanz/kernel';
import { useTranslation } from 'react-i18next';
import { Panel } from '../../components/Panel';
import { DashboardView } from './DashboardView';
import { SpendingDonut } from './SpendingPanel';
import {
  SAMPLE_BUDGETS,
  SAMPLE_HERO,
  SAMPLE_MONTH,
  SAMPLE_RECENT,
  SAMPLE_SPENDING,
  SAMPLE_TILES,
  SAMPLE_UPCOMING,
} from './sample';

export function DevPreview() {
  const { t } = useTranslation();
  return (
    <DashboardView
      notice={
        <p className="inline-block rounded-full bg-brand-soft px-3 py-1 font-medium text-brand text-sm">
          {t('preview.badge')} {t('preview.note')}
        </p>
      }
      hero={SAMPLE_HERO}
      accounts={SAMPLE_TILES}
      month={SAMPLE_MONTH}
      budgets={SAMPLE_BUDGETS}
      upcoming={SAMPLE_UPCOMING}
      today={parseLocalDate('2026-10-14')}
      recent={SAMPLE_RECENT}
      spending={
        <Panel title={t('dashboard.spending')} className="h-full">
          <SpendingDonut
            slices={SAMPLE_SPENDING}
            total={SAMPLE_SPENDING.reduce((sum, s) => sum + s.amount, 0n)}
            currency="COP"
          />
        </Panel>
      }
    />
  );
}
