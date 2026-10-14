import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'oled';
export type ThemePreference = 'system' | Theme;
type DarkTheme = Exclude<Theme, 'light'>;

// Device-local until user preferences are stored on the server (after login exists).
const STORAGE_KEY = 'finanz.theme';
/** Which dark the quick toggle returns to, so OLED users don't land on regular dark. */
const DARK_VARIANT_KEY = 'finanz.theme.dark';
const META_COLOR: Record<Theme, string> = { light: '#f5f7fa', dark: '#0b1120', oled: '#000000' };
const THEMES: readonly string[] = ['light', 'dark', 'oled'] satisfies Theme[];
const listeners = new Set<() => void>();

const systemDarkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Mirrored by public/theme-init.js, which applies the theme before first paint. */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readThemePreference(): ThemePreference {
  const stored = readStorage(STORAGE_KEY);
  return stored && THEMES.includes(stored) ? (stored as Theme) : 'system';
}

function currentTheme(): Theme {
  const applied = document.documentElement.dataset.theme;
  return applied && THEMES.includes(applied) ? (applied as Theme) : 'light';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme]);
}

function refresh(): void {
  applyTheme(resolveTheme(readThemePreference(), systemDarkQuery().matches));
  for (const listener of listeners) listener();
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
    if (preference === 'dark' || preference === 'oled') {
      localStorage.setItem(DARK_VARIANT_KEY, preference);
    }
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
    applyTheme(resolveTheme(preference, systemDarkQuery().matches));
    for (const listener of listeners) listener();
    return;
  }
  refresh();
}

/** Quick switch: light ↔ the user's dark (regular or OLED). */
export function toggleTheme(): void {
  if (currentTheme() !== 'light') {
    setThemePreference('light');
    return;
  }
  const variant: DarkTheme = readStorage(DARK_VARIANT_KEY) === 'oled' ? 'oled' : 'dark';
  setThemePreference(variant);
}

/** Call once at startup: follows system changes and choices made in other tabs. */
export function startThemeSync(): void {
  refresh();
  systemDarkQuery().addEventListener('change', refresh);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) refresh();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => `${readThemePreference()}|${currentTheme()}`;

export function useTheme(): { preference: ThemePreference; theme: Theme } {
  const [preference, theme] = useSyncExternalStore(subscribe, snapshot, () => 'system|light').split(
    '|',
  ) as [ThemePreference, Theme];
  return { preference, theme };
}
