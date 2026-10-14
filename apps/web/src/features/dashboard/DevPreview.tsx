import { useTranslation } from 'react-i18next';
import { DashboardView } from './DashboardView';
import { SAMPLE_ACCOUNTS, SAMPLE_RECENT, SAMPLE_SUMMARY } from './sample';

export function DevPreview() {
  const { t } = useTranslation();
  return (
    <>
      <p className="mb-4 inline-block rounded-full bg-brand-soft px-3 py-1 font-medium text-brand text-sm">
        {t('preview.badge')}
      </p>
      <p className="mb-6 text-muted text-sm">{t('preview.note')}</p>
      <DashboardView summary={SAMPLE_SUMMARY} accounts={SAMPLE_ACCOUNTS} recent={SAMPLE_RECENT} />
    </>
  );
}
