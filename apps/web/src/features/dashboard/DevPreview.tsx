import { useTranslation } from 'react-i18next';
import { Panel } from '../../components/Panel';
import { DashboardView } from './DashboardView';
import { SpendingDonut } from './SpendingPanel';
import { SAMPLE_ACCOUNTS, SAMPLE_RECENT, SAMPLE_SPENDING, SAMPLE_SUMMARY } from './sample';

export function DevPreview() {
  const { t } = useTranslation();
  return (
    <>
      <p className="mb-4 inline-block rounded-full bg-brand-soft px-3 py-1 font-medium text-brand text-sm">
        {t('preview.badge')}
      </p>
      <p className="mb-6 text-muted text-sm">{t('preview.note')}</p>
      <DashboardView
        summary={SAMPLE_SUMMARY}
        accounts={SAMPLE_ACCOUNTS}
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
    </>
  );
}
