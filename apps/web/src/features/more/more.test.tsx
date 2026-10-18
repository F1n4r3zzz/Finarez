import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { startThemeSync } from '../../app/theme';
import { fakeApi, renderApp, signedIn } from '../../test/fake-api';

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  startThemeSync();
  fakeApi(signedIn);
});

describe('Más', () => {
  it('lists every section that has no place in the bottom bar, each with what it is for', async () => {
    renderApp('/more');
    const sections = within(await screen.findByRole('navigation', { name: 'Todas las secciones' }));
    for (const name of [
      'Cuentas',
      'Presupuestos',
      'Ahorros',
      'Deudas',
      'Patrimonio',
      'Inversiones',
      'Importar',
    ]) {
      expect(sections.getByRole('link', { name: new RegExp(name) })).toBeTruthy();
    }
    expect(sections.getByText('Tus metas de ahorro y cuánto te falta para cada una.')).toBeTruthy();
  });

  it('leads to Ajustes and the legal documents', async () => {
    renderApp('/more');
    const account = within(await screen.findByRole('navigation', { name: 'Tu cuenta' }));
    expect(account.getByRole('link', { name: /Ajustes/ }).getAttribute('href')).toBe('/settings');
    expect(account.getByRole('link', { name: /Legal y privacidad/ }).getAttribute('href')).toBe(
      '/legal',
    );
  });

  it('switches the theme right there', async () => {
    renderApp('/more');
    fireEvent.click(await screen.findByRole('radio', { name: 'Oscuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('signs out', async () => {
    renderApp('/more');
    const button = await screen.findByRole('button', { name: 'Salir' });
    expect(button.closest('form')?.getAttribute('action')).toBe('/sign-out');
  });
});
