import { CircleAlert, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';
import { BandArt } from '../../components/BandArt';
import { isApiFailure } from '../../lib/api';

const BUTTON =
  'mt-6 inline-flex min-h-11 items-center rounded-full bg-action px-5 font-semibold text-on-action';

/** Shown when a route fails to render. Uses plain links: the router may be what broke. */
export function ErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  // The API didn't answer (offline, or the server is down): retrying is the useful action.
  const unreachable = isApiFailure(error) && (error.status === 0 || error.status >= 500);

  if (unreachable) {
    return (
      <Frame>
        <WifiOff size={32} aria-hidden="true" className="text-muted" />
        <h1 className="mt-4 font-semibold text-3xl">{t('error.offlineTitle')}</h1>
        <p className="mt-2 text-muted">{t('error.offlineBody')}</p>
        <button type="button" onClick={() => window.location.reload()} className={BUTTON}>
          {t('error.retry')}
        </button>
      </Frame>
    );
  }

  return (
    <Frame>
      <CircleAlert size={32} aria-hidden="true" className="text-expense" />
      <h1 className="mt-4 font-semibold text-3xl">{t('error.title')}</h1>
      <p className="mt-2 text-muted">{t('error.body')}</p>
      <a href="/" className={BUTTON}>
        {t('app.goHome')}
      </a>
    </Frame>
  );
}

/** The band on top, the message below. Plain markup only: the router may be what broke. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="relative h-16 overflow-hidden border-band-edge border-b bg-band lg:h-[76px]">
        <BandArt />
      </div>
      <main className="mx-auto max-w-xl px-6 py-16">{children}</main>
    </>
  );
}
