import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { MODULES } from '../../app/modules';
import { useShowInvestments } from '../../app/preferences';
import { PageHeader } from '../../components/PageHeader';

/** Mobile: every section, since the bottom bar only fits five. */
export function MorePage() {
  const { t } = useTranslation();
  const showInvestments = useShowInvestments();
  const visible = MODULES.filter((m) => !m.optional || showInvestments);
  return (
    <>
      <PageHeader title={t('modules.more.title')} description={t('modules.more.description')} />
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {visible.map((m) => {
          const Icon = m.icon;
          return (
            <li key={m.id}>
              <Link to={m.path} className="flex items-center gap-4 px-5 py-4">
                <Icon size={20} aria-hidden="true" className="shrink-0 text-brand" />
                <span className="min-w-0">
                  <span className="block font-medium">{t(`modules.${m.id}.title`)}</span>
                  <span className="block truncate text-muted text-sm">
                    {t(`modules.${m.id}.description`)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
