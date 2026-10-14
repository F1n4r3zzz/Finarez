import { CircleAlert, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';
import { isApiFailure } from '../../lib/api';

const BUTTON =
  'mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand px-4 font-medium text-on-brand';

/** Shown when a route fails to render. Uses plain links: the router may be what broke. */
export function ErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  // The API didn't answer (offline, or the server is down): retrying is the useful action.
  const unreachable = isApiFailure(error) && (error.status === 0 || error.status >= 500);

  if (unreachable) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <WifiOff size={32} aria-hidden="true" className="text-muted" />
        <h1 className="mt-4 font-semibold text-3xl">{t('error.offlineTitle')}</h1>
        <p className="mt-2 text-muted">{t('error.offlineBody')}</p>
        <button type="button" onClick={() => window.location.reload()} className={BUTTON}>
          {t('error.retry')}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <CircleAlert size={32} aria-hidden="true" className="text-expense" />
      <h1 className="mt-4 font-semibold text-3xl">{t('error.title')}</h1>
      <p className="mt-2 text-muted">{t('error.body')}</p>
      <a href="/" className={BUTTON}>
        {t('app.goHome')}
      </a>
    </main>
  );
}
