import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('notFound.title')} description={t('notFound.body')} />
      <Link
        to="/"
        className="inline-flex min-h-11 items-center rounded-full bg-action px-5 font-semibold text-on-action"
      >
        {t('app.goHome')}
      </Link>
    </>
  );
}
