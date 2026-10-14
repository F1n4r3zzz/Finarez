import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { moduleById } from '../../app/modules';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export function ImportPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('modules.import.title')} description={t('modules.import.description')} />
      <EmptyState
        icon={moduleById('import').icon}
        title={t('empty.import.title')}
        body={t('empty.import.body')}
      >
        <p className="mt-6 font-medium">{t('empty.import.formats')}</p>
        <p className="mt-2 flex max-w-prose items-start gap-2 text-muted text-sm">
          <ShieldCheck size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
          {t('empty.import.macros')}
        </p>
      </EmptyState>
    </>
  );
}
