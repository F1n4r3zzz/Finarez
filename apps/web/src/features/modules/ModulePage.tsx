import { useTranslation } from 'react-i18next';
import { moduleById } from '../../app/modules';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export type SimpleModuleId =
  | 'accounts'
  | 'transactions'
  | 'budgets'
  | 'savings'
  | 'debts'
  | 'networth'
  | 'reports'
  | 'investments';

/** A section whose data isn't available yet: title, purpose and what will appear here. */
export function ModulePage({ id }: { id: SimpleModuleId }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t(`modules.${id}.title`)} description={t(`modules.${id}.description`)} />
      <EmptyState
        icon={moduleById(id).icon}
        title={t(`empty.${id}.title`)}
        body={t(`empty.${id}.body`)}
      />
    </>
  );
}
