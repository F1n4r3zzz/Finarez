import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router';
import type { ModuleDef } from './modules';

/**
 * The desktop top menu's "Más": a button that shows the sections without a pill. A disclosure
 * (not an ARIA menu): Tab moves through its links, Escape closes it and returns to the button,
 * and choosing a link or clicking elsewhere closes it.
 */
export function MoreMenu({ modules }: { modules: readonly ModuleDef[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const { pathname } = useLocation();
  const current = modules.some((m) => pathname.startsWith(m.path));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        data-current={current ? 'true' : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 transition-colors duration-150 hover:text-on-band ${
          current || open
            ? 'bg-band-chip font-semibold text-on-band'
            : 'font-medium text-band-muted'
        }`}
      >
        {t('modules.more.title')}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul
          id={listId}
          className="absolute top-full left-0 z-30 mt-2 grid min-w-60 gap-0.5 rounded-2xl border border-line bg-surface p-2 text-ink shadow-lg"
        >
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.id}>
                <NavLink
                  to={m.path}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-xl px-3 transition-colors duration-150 ${
                      isActive ? 'bg-brand-soft font-semibold text-brand' : 'hover:bg-hover'
                    }`
                  }
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  {t(`modules.${m.id}.title`)}
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
