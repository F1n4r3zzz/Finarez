import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section className="py-16">
      <h1 className="text-3xl font-semibold">{t('notFound.title')}</h1>
      <p className="mt-2 text-muted">{t('notFound.body')}</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-full bg-action px-5 py-2 font-semibold text-on-action"
      >
        {t('app.goHome')}
      </Link>
    </section>
  );
}
