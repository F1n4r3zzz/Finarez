import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Shown when a route fails to render. Uses a plain link: the router may be what broke. */
export function ErrorPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <CircleAlert size={32} aria-hidden="true" className="text-expense" />
      <h1 className="mt-4 text-3xl font-semibold">{t('error.title')}</h1>
      <p className="mt-2 text-muted">{t('error.body')}</p>
      <a
        href="/"
        className="mt-6 inline-block rounded-lg bg-brand px-4 py-2 font-medium text-on-brand"
      >
        {t('app.goHome')}
      </a>
    </main>
  );
}
