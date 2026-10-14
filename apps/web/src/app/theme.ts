import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

// Device-local until user preferences are stored on the server (after login exists).
const STORAGE_KEY = 'finanz.theme';
const META_COLOR: Record<Theme, string> = { light: '#f5f7fa', dark: '#0b1120' };
const listeners = new Set<() => void>();

const systemDarkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(): void {
  const theme = resolveTheme(readThemePreference(), systemDarkQuery().matches);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme]);
}

function refresh(): void {
  applyTheme();
  for (const listener of listeners) listener();
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
    document.documentElement.dataset.theme = resolveTheme(preference, systemDarkQuery().matches);
    for (const listener of listeners) listener();
    return;
  }
  refresh();
}

/** Call once at startup: follows system changes and choices made in other tabs. */
export function startThemeSync(): void {
  applyTheme();
  systemDarkQuery().addEventListener('change', refresh);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) refresh();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () =>
  `${readThemePreference()}|${document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'}`;

export function useTheme(): { preference: ThemePreference; theme: Theme } {
  const [preference, theme] = useSyncExternalStore(subscribe, snapshot, () => 'system|light').split(
    '|',
  ) as [ThemePreference, Theme];
  return { preference, theme };
}
