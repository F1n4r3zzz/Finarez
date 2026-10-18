import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toggleTheme, useTheme } from '../app/theme';

/** Quick light ↔ dark switch. The full choice lives in Ajustes. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const label = t(isLight ? 'app.toDark' : 'app.toLight');
  const Icon = isLight ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
