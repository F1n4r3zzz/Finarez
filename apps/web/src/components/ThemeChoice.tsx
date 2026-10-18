import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setThemePreference, useTheme } from '../app/theme';

const THEME_OPTIONS = [
  { value: 'system', icon: Monitor, key: 'settings.themeSystem' },
  { value: 'light', icon: Sun, key: 'settings.themeLight' },
  { value: 'dark', icon: Moon, key: 'settings.themeDark' },
] as const;

/** Como el sistema, Claro or Oscuro, as one choice; saved on this device. */
export function ThemeChoice() {
  const { t } = useTranslation();
  const { preference } = useTheme();
  return (
    <fieldset>
      <legend className="sr-only">{t('settings.appearance')}</legend>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-[22px] border border-line bg-hover p-1">
        {THEME_OPTIONS.map(({ value, icon: Icon, key }) => (
          <label
            key={value}
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-medium text-muted transition-colors duration-150 hover:text-ink has-checked:bg-surface has-checked:font-semibold has-checked:text-ink has-checked:ring-1 has-checked:ring-line-strong has-focus-visible:outline-2 has-focus-visible:outline-brand"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => setThemePreference(value)}
              className="sr-only"
            />
            <Icon size={16} aria-hidden="true" />
            {t(key)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
