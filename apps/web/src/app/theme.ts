import { useSyncExternalStore } from 'react';

/** Light, or dark (a true black page, made for OLED phones). */
export type Theme = 'light' | 'dark';
export type ThemePreference = 'system' | Theme;

// Device-local until user preferences are stored on the server (after login exists).
const STORAGE_KEY = 'finanz.theme';
/** Left by the version that had two darks; removed on the next choice. */
const OLD_DARK_VARIANT_KEY = 'finanz.theme.dark';
/** The browser bar takes the band's color, so the top of the phone screen is one piece. */
const META_COLOR: Record<Theme, string> = { light: '#12285A', dark: '#1E3A8A' };
const THEMES: readonly string[] = ['light', 'dark'] satisfies Theme[];
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
  // "oled" was the black dark of the previous version, which is now the only dark.
  if (stored === 'oled') return 'dark';
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
    localStorage.removeItem(OLD_DARK_VARIANT_KEY);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
    applyTheme(resolveTheme(preference, systemDarkQuery().matches));
    for (const listener of listeners) listener();
    return;
  }
  refresh();
}

/** Quick switch between light and dark. */
export function toggleTheme(): void {
  setThemePreference(currentTheme() === 'light' ? 'dark' : 'light');
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
