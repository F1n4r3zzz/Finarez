import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useRevalidator } from 'react-router';
import { ThemeToggle } from '../components/ThemeToggle';
import { Wordmark } from '../components/Wordmark';
import { runRecurring } from '../features/recurring/api';
import { BandSlotProvider, BandSlotTarget } from './band';
import { MODULES, MORE, type ModuleDef } from './modules';
import { useShowInvestments } from './preferences';

const GROUPS: readonly ModuleDef['group'][] = ['daily', 'plan', 'analyze'];

function SidebarLink({ module }: { module: ModuleDef }) {
  const { t } = useTranslation();
  const Icon = module.icon;
  return (
    <NavLink
      to={module.path}
      end={module.path === '/'}
      className={({ isActive }) =>
        `flex min-h-10 items-center gap-3 rounded-lg px-3 text-[0.9375rem] transition-colors duration-150 ${
          isActive
            ? 'bg-brand-soft font-medium text-brand'
            : 'text-muted hover:bg-hover hover:text-ink'
        }`
      }
    >
      <Icon size={18} aria-hidden="true" />
      {t(`modules.${module.id}.title`)}
    </NavLink>
  );
}

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

export function AppShell() {
  const { t } = useTranslation();
  useRecurringRun();
  const showInvestments = useShowInvestments();
  const visible = MODULES.filter((m) => !m.optional || showInvestments);
  const settings = visible.filter((m) => m.group === 'settings');
  const bar = visible.filter((m) => m.mobile);
  const mobile = [...bar, MORE];
  const { pathname } = useLocation();
  // Sections without a place in the bar are reached through "Más", so it stays lit there.
  const inBar = bar.some((m) => (m.path === '/' ? pathname === '/' : pathname.startsWith(m.path)));

  return (
    <BandSlotProvider>
      <div className="min-h-dvh md:grid md:grid-cols-[240px_minmax(0,1fr)]">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-surface px-4 py-2 font-medium text-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {t('app.skipToContent')}
        </a>

        <aside className="sticky top-0 hidden h-dvh flex-col border-line border-r bg-chrome px-3 py-5 md:flex">
          <div className="flex items-center justify-between pl-3">
            <Wordmark />
            <ThemeToggle />
          </div>
          <nav aria-label={t('app.mainNav')} className="mt-7 flex flex-1 flex-col">
            {GROUPS.map((group, index) => (
              <ul
                key={group}
                className={`flex flex-col gap-0.5 ${index > 0 ? 'mt-3 border-line border-t pt-3' : ''}`}
              >
                {visible
                  .filter((m) => m.group === group)
                  .map((m) => (
                    <li key={m.id}>
                      <SidebarLink module={m} />
                    </li>
                  ))}
              </ul>
            ))}
            <ul className="mt-auto flex flex-col gap-0.5 border-line border-t pt-3">
              {settings.map((m) => (
                <li key={m.id}>
                  <SidebarLink module={m} />
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-line border-b bg-chrome pr-1.5 pl-4 md:hidden">
          <Wordmark />
          <ThemeToggle />
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="px-4 pt-6 pb-28 outline-none md:px-8 md:pt-8 md:pb-12 lg:px-10"
        >
          <BandSlotTarget className="-mx-4 -mt-6 mb-6 bg-band px-4 pb-8 md:-mx-8 md:-mt-8 md:px-8" />
          <div className="mx-auto max-w-[1200px]">
            <Outlet />
          </div>
        </main>

        <nav
          aria-label={t('app.mobileNav')}
          className="fixed inset-x-0 bottom-0 z-10 border-line border-t bg-chrome pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <ul className="grid grid-cols-5">
            {mobile.map((m) => {
              const Icon = m.icon;
              return (
                <li key={m.id}>
                  <NavLink
                    to={m.path}
                    end={m.path === '/'}
                    className={({ isActive }) => {
                      const lit = isActive || (m.id === 'more' && !inBar);
                      return `group flex min-h-16 flex-col items-center justify-center gap-1 text-xs transition-colors duration-150 ${
                        lit ? 'lit font-semibold text-brand' : 'text-muted'
                      }`;
                    }}
                  >
                    <span className="flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-150 group-[.lit]:bg-brand-soft">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    {t(`modules.${m.id}.title`)}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </BandSlotProvider>
  );
}
