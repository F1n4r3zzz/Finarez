import { Plus, Settings } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useRevalidator } from 'react-router';
import { ThemeToggle } from '../components/ThemeToggle';
import { Wordmark } from '../components/Wordmark';
import { runRecurring } from '../features/recurring/api';
import { BandSlotProvider, BandSlotTarget, useBandOverlapValue } from './band';
import { MoreMenu } from './MoreMenu';
import { MODULES, MORE, type ModuleDef } from './modules';
import { useShowInvestments } from './preferences';

/**
 * Once per app open, records the recurring movements that came due (or queues them for
 * confirmation) and refreshes what is on screen if anything changed. Failures stay silent: the
 * next open tries again, and nothing on screen depends on it.
 */
function useRecurringRun() {
  const { revalidate } = useRevalidator();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runRecurring()
      .then((result) => {
        if (result.posted > 0 || result.pending > 0) revalidate();
      })
      .catch(() => {});
  }, [revalidate]);
}

const matches = (m: ModuleDef, pathname: string) =>
  m.path === '/' ? pathname === '/' : pathname.startsWith(m.path);

/** The new-movement and edit pages are a full-screen sheet on phones, without the bottom bar. */
const isMovementForm = (pathname: string) =>
  /^\/transactions\/(?!recurring(\/|$))[^/]+$/.test(pathname);

/** The logo's two arrows, faint in the band, always whole inside it. */
function BandArt() {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="absolute top-2 right-[-2%] h-[calc(100%-1rem)] max-h-[25rem] w-auto opacity-[0.08] dark:opacity-[0.07]"
    >
      <path d="M7 10h26V4l17 15-17 15v-6H7z" className="fill-logo" />
      <path d="M57 54H31v6L14 45l17-15v6h26z" className="fill-logo-accent" />
    </svg>
  );
}

const CONTAINER = 'mx-auto w-full max-w-[1280px] px-4 lg:px-12';

function TopPill({ module }: { module: ModuleDef }) {
  const { t } = useTranslation();
  return (
    <NavLink
      to={module.path}
      end={module.path === '/'}
      className={({ isActive }) =>
        `flex min-h-10 items-center rounded-full px-3.5 transition-colors duration-150 hover:text-on-band ${
          isActive ? 'bg-band-chip font-semibold text-on-band' : 'font-medium text-band-muted'
        }`
      }
    >
      {t(`modules.${module.id}.title`)}
    </NavLink>
  );
}

function Shell() {
  const { t } = useTranslation();
  useRecurringRun();
  const showInvestments = useShowInvestments();
  const overlap = useBandOverlapValue();
  const { pathname } = useLocation();
  const visible = MODULES.filter((m) => !m.optional || showInvestments);
  const top = visible.filter((m) => m.top);
  const inMore = visible.filter((m) => !m.top && m.group !== 'settings');
  const bar = visible.filter((m) => m.bar);
  const settings = visible.find((m) => m.id === 'settings');
  const showBar = !isMovementForm(pathname);
  // Sections without a place in the bar are reached through "Más", so it stays lit there.
  const inBar = bar.some((m) => matches(m, pathname));

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-4 py-2 font-medium text-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('app.skipToContent')}
      </a>

      {/* Transparent: the band behind it is drawn by <main>'s first block, so the two read as one. */}
      <header className="relative z-20">
        <div className={`${CONTAINER} flex h-16 items-center gap-3 lg:h-[76px] lg:gap-7`}>
          <Wordmark />
          <nav aria-label={t('app.mainNav')} className="flex flex-1 items-center gap-2">
            <ul className="hidden items-center gap-1 lg:flex">
              {top.map((m) => (
                <li key={m.id}>
                  <TopPill module={m} />
                </li>
              ))}
              <li>
                <MoreMenu key={pathname} modules={inMore} />
              </li>
            </ul>
            <div className="ml-auto flex items-center gap-2">
              <Link
                to="/transactions/new"
                className="hidden min-h-11 items-center gap-2 rounded-full bg-cta px-5 font-bold text-on-cta transition-[filter] duration-150 hover:brightness-105 lg:inline-flex"
              >
                <Plus size={18} aria-hidden="true" />
                <span className="xl:hidden">{t('app.registerShort')}</span>
                <span className="hidden xl:inline">{t('app.register')}</span>
              </Link>
              <ThemeToggle />
              {settings && (
                <NavLink
                  to={settings.path}
                  aria-label={t('modules.settings.title')}
                  title={t('modules.settings.title')}
                  className={({ isActive }) =>
                    `inline-flex size-11 items-center justify-center rounded-full text-on-band transition-colors duration-150 ${
                      isActive ? 'bg-on-band/25' : 'bg-band-chip hover:bg-band-chip/80'
                    }`
                  }
                >
                  <Settings size={18} aria-hidden="true" />
                </NavLink>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className={`flex-1 outline-none ${showBar ? 'pb-28 lg:pb-16' : 'pb-16'}`}
      >
        <div className={`relative ${overlap ? 'pb-24' : 'pb-9'}`}>
          <div
            aria-hidden="true"
            className="absolute inset-x-0 -top-16 bottom-0 -z-10 overflow-hidden border-band-edge border-b bg-band lg:-top-[76px]"
          >
            <BandArt />
          </div>
          <BandSlotTarget className={`${CONTAINER} relative`} />
        </div>
        <div className={`${CONTAINER} relative ${overlap ? '-mt-16' : 'pt-7'}`}>
          <Outlet />
        </div>
      </main>

      {showBar && (
        <nav
          aria-label={t('app.mobileNav')}
          className="fixed inset-x-0 bottom-0 z-30 border-line border-t bg-chrome pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <ul className="grid grid-cols-5 items-end">
            {[...bar.slice(0, 2), null, ...bar.slice(2), MORE].map((m) =>
              m === null ? (
                <li key="register" className="flex justify-center">
                  <NavLink
                    to="/transactions/new"
                    aria-label={t('app.register')}
                    className="-mt-7 mb-2 flex size-[3.625rem] items-center justify-center rounded-full border-4 border-paper bg-action text-on-action"
                  >
                    <Plus size={26} strokeWidth={2.5} aria-hidden="true" />
                  </NavLink>
                </li>
              ) : (
                <li key={m.id}>
                  <BarLink module={m} lit={m.id === 'more' ? !inBar : undefined} />
                </li>
              ),
            )}
          </ul>
        </nav>
      )}
    </div>
  );
}

function BarLink({ module, lit }: { module: ModuleDef; lit?: boolean }) {
  const { t } = useTranslation();
  const Icon = module.icon;
  return (
    <NavLink
      to={module.path}
      end={module.path === '/'}
      className={({ isActive }) =>
        `flex min-h-16 flex-col items-center justify-center gap-1 text-xs transition-colors duration-150 ${
          (lit ?? isActive) ? 'lit font-bold text-ink' : 'font-medium text-muted'
        }`
      }
    >
      <Icon size={22} aria-hidden="true" />
      {t(`modules.${module.id}.title`)}
    </NavLink>
  );
}

export function AppShell() {
  return (
    <BandSlotProvider>
      <Shell />
    </BandSlotProvider>
  );
}
