import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Wordmark } from '../../components/Wordmark';

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
      <header className="flex h-16 items-center justify-between pr-1.5 pl-4 md:px-8">
        <Wordmark />
        <ThemeToggle />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 justify-center px-4 pt-4 pb-16 outline-none md:items-center md:pt-0"
      >
        <div className="w-full max-w-[26rem]">
          <Outlet />
        </div>
      </main>
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
      {/* A card on wider screens; on phones the form uses the full width. */}
      <section className="md:rounded-xl md:border md:border-line md:bg-surface md:p-8">
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-muted">{description}</p>}
        <div className="mt-6">{children}</div>
      </section>
      {footer && <p className="mt-6 text-muted md:mt-5 md:px-8">{footer}</p>}
    </>
  );
}
