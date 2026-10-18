import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { BandArt } from '../../components/BandArt';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Wordmark } from '../../components/Wordmark';
import { LegalLinks } from '../legal/LegalLinks';

/** Frame for pages outside the app: sign in, sign up, password reset, first setup. */
export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-4 py-2 font-medium text-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('app.skipToContent')}
      </a>
      <div
        data-band
        className="relative overflow-hidden border-band-edge border-b bg-band pb-44 sm:pb-52"
      >
        <BandArt />
        <header className="relative mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 lg:h-[76px] lg:px-12">
          <Wordmark />
          <ThemeToggle />
        </header>
        <div className="relative px-4 pt-4 text-center sm:pt-6">
          <p className="font-semibold text-2xl text-on-band tracking-tight sm:text-[2.125rem]">
            {t('app.promise')}
          </p>
          <p className="mt-1.5 text-band-muted">{t('app.promiseDetail')}</p>
        </div>
      </div>
      <main
        id="main"
        tabIndex={-1}
        className="relative -mt-36 flex flex-1 justify-center px-4 pb-10 outline-none sm:-mt-44"
      >
        <div className="w-full max-w-[32rem]">
          <Outlet />
        </div>
      </main>
      <footer className="px-4 pb-8">
        <div className="flex justify-center [&_ul]:justify-center">
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** Under the card: the way to the other auth page. */
  footer?: ReactNode;
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <>
      <section className="rounded-[26px] border border-line bg-surface p-6 sm:p-8">
        <h1 className="font-semibold text-[1.75rem] tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-muted">{description}</p>}
        <div className="mt-6">{children}</div>
      </section>
      {footer && <p className="mt-5 text-center text-muted">{footer}</p>}
    </>
  );
}
