import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { Wordmark } from '../components/Wordmark';
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
        `flex items-center gap-3 rounded-lg px-3 py-2 text-[0.95rem] transition-colors ${
          isActive
            ? 'bg-brand-soft font-semibold text-brand'
            : 'text-muted hover:bg-brand-soft/60 hover:text-ink'
        }`
      }
    >
      <Icon size={18} aria-hidden="true" />
      {t(`modules.${module.id}.title`)}
    </NavLink>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const showInvestments = useShowInvestments();
  const visible = MODULES.filter((m) => !m.optional || showInvestments);
  const settings = visible.filter((m) => m.group === 'settings');
  const mobile = [...visible.filter((m) => m.mobile), MORE];

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-4 py-2 font-medium text-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('app.skipToContent')}
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-line border-r px-4 py-6 md:flex">
        <div className="px-3">
          <Wordmark />
        </div>
        <nav aria-label={t('app.mainNav')} className="mt-8 flex flex-1 flex-col">
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

      <header className="sticky top-0 z-10 flex h-14 items-center border-line border-b bg-paper px-4 md:hidden">
        <Wordmark />
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="px-4 pt-6 pb-28 outline-none md:px-10 md:pt-10 md:pb-12"
      >
        <div className="mx-auto max-w-[1200px]">
          <Outlet />
        </div>
      </main>

      <nav
        aria-label={t('app.mobileNav')}
        className="fixed inset-x-0 bottom-0 z-10 border-line border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {mobile.map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.id}>
                <NavLink
                  to={m.path}
                  end={m.path === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 py-2 text-xs ${
                      isActive ? 'font-semibold text-brand' : 'text-muted'
                    }`
                  }
                >
                  <Icon size={20} aria-hidden="true" />
                  {t(`modules.${m.id}.title`)}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
