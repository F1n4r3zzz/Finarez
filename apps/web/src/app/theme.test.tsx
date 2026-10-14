import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp, signedIn } from '../test/fake-api';
import { resolveTheme, setThemePreference, startThemeSync, toggleTheme } from './theme';

const html = document.documentElement;

beforeEach(() => {
  delete html.dataset.theme;
  document.head.innerHTML = '<meta name="theme-color" content="" />';
  startThemeSync();
});

describe('resolveTheme', () => {
  it('follows the system only when the user chose "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('oled', false)).toBe('oled');
  });
});

describe('setThemePreference', () => {
  it('applies the theme, the browser bar color and remembers the choice', () => {
    act(() => setThemePreference('dark'));
    expect(html.dataset.theme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0b1120',
    );
    expect(localStorage.getItem('finanz.theme')).toBe('dark');

    act(() => setThemePreference('system'));
    expect(localStorage.getItem('finanz.theme')).toBeNull();
    expect(html.dataset.theme).toBe('light'); // the test browser reports a light system theme
  });
});

describe('OLED theme', () => {
  it('uses a pure black browser bar and is remembered by the quick toggle', () => {
    act(() => setThemePreference('oled'));
    expect(html.dataset.theme).toBe('oled');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#000000',
    );

    act(() => toggleTheme());
    expect(html.dataset.theme).toBe('light');
    act(() => toggleTheme());
    expect(html.dataset.theme).toBe('oled');
  });

  it('the quick toggle goes to regular dark for users who never chose OLED', () => {
    act(() => setThemePreference('light'));
    act(() => toggleTheme());
    expect(html.dataset.theme).toBe('dark');
  });
});

describe('theme controls', () => {
  beforeEach(() => {
    fakeApi(signedIn);
  });

  it('the quick toggle switches between light and dark', async () => {
    renderApp('/');
    const [toggle] = await screen.findAllByRole('button', { name: 'Cambiar a tema oscuro' });
    act(() => toggle?.click());
    expect(html.dataset.theme).toBe('dark');
    // The router renders in transitions, so the new label may land a tick later.
    expect(
      (await screen.findAllByRole('button', { name: 'Cambiar a tema claro' })).length,
    ).toBeGreaterThan(0);
  });

  it('Ajustes offers system, light, dark and OLED as a single choice', async () => {
    renderApp('/settings');
    const dark = await screen.findByRole('radio', { name: 'Oscuro' });
    expect(
      (screen.getByRole('radio', { name: 'Como el sistema' }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(dark);
    expect((dark as HTMLInputElement).checked).toBe(true);
    expect(html.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('radio', { name: 'Negro (OLED)' }));
    expect(html.dataset.theme).toBe('oled');
  });
});
