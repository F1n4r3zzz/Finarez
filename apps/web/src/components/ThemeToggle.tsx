import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setThemePreference, useTheme } from '../app/theme';

/** Quick light/dark switch. "Como el sistema" lives in Ajustes. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = t(next === 'dark' ? 'app.toDark' : 'app.toLight');
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setThemePreference(next)}
      aria-label={label}
      title={label}
      className="inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
