import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toggleTheme, useTheme } from '../app/theme';

const TONES = {
  /** On the brand band. */
  band: 'rounded-full bg-band-chip text-on-band hover:bg-band-chip/80',
  plain: 'rounded-lg text-muted hover:bg-hover hover:text-ink',
} as const;

/** Quick light ↔ dark switch. The full choice lives in Ajustes. */
export function ThemeToggle({ tone = 'band' }: { tone?: keyof typeof TONES }) {
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
      className={`inline-flex size-11 shrink-0 items-center justify-center transition-colors duration-150 ${TONES[tone]}`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
