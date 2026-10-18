import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp, signedIn } from '../test/fake-api';
import {
  readThemePreference,
  resolveTheme,
  setThemePreference,
  startThemeSync,
  toggleTheme,
} from './theme';

const html = document.documentElement;
const barColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

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
  });
});

describe('setThemePreference', () => {
  it('applies the theme and the band color to the browser bar', () => {
    act(() => setThemePreference('dark'));
    expect(html.dataset.theme).toBe('dark');
    expect(barColor()).toBe('#1E3A8A');
    expect(localStorage.getItem('finanz.theme')).toBe('dark');

    act(() => setThemePreference('light'));
    expect(barColor()).toBe('#12285A');

    act(() => setThemePreference('system'));
    expect(localStorage.getItem('finanz.theme')).toBeNull();
    expect(html.dataset.theme).toBe('light'); // the test browser reports a light system theme
  });

  it('reads an "oled" choice saved by the old version as dark', () => {
    localStorage.setItem('finanz.theme', 'oled');
    act(() => startThemeSync());
    expect(readThemePreference()).toBe('dark');
    expect(html.dataset.theme).toBe('dark');
  });

  it('the quick toggle switches light and dark and forgets the old dark variant', () => {
    localStorage.setItem('finanz.theme.dark', 'oled');
    act(() => setThemePreference('light'));
    expect(localStorage.getItem('finanz.theme.dark')).toBeNull();
    act(() => toggleTheme());
    expect(html.dataset.theme).toBe('dark');
    act(() => toggleTheme());
    expect(html.dataset.theme).toBe('light');
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

  it('Ajustes offers system, light and dark as a single choice', async () => {
    renderApp('/settings');
    const dark = await screen.findByRole('radio', { name: 'Oscuro' });
    expect(
      (screen.getByRole('radio', { name: 'Como el sistema' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /OLED|Negro/ })).toBeNull();
    fireEvent.click(dark);
    expect((dark as HTMLInputElement).checked).toBe(true);
    expect(html.dataset.theme).toBe('dark');
  });
});
