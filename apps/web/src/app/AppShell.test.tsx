import { act, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp, signedIn } from '../test/fake-api';
import { setShowInvestments } from './preferences';

const renderAt = async (path: string) => {
  renderApp(path);
  await screen.findByRole('navigation', { name: 'Navegación principal' });
};

const mainNav = () => screen.getByRole('navigation', { name: 'Navegación principal' });

beforeEach(() => {
  fakeApi(signedIn);
});

describe('AppShell', () => {
  it('lists every section in Spanish and marks the current one', async () => {
    await renderAt('/accounts');
    const nav = within(mainNav());
    for (const label of [
      'Inicio',
      'Cuentas',
      'Movimientos',
      'Importar',
      'Presupuestos',
      'Ahorros',
      'Deudas',
      'Patrimonio',
      'Reportes',
      'Inversiones',
      'Ajustes',
    ]) {
      expect(nav.getByRole('link', { name: label })).toBeTruthy();
    }
    expect(nav.getByRole('link', { name: 'Cuentas' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Inicio' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Cuentas' })).toBeTruthy();
  });

  it('hides the optional investments section when the user turns it off', async () => {
    await renderAt('/');
    expect(within(mainNav()).queryByRole('link', { name: 'Inversiones' })).toBeTruthy();
    act(() => setShowInvestments(false));
    expect(within(mainNav()).queryByRole('link', { name: 'Inversiones' })).toBeNull();
  });

  it('keeps the mobile bar to five entries ending in "Más"', async () => {
    await renderAt('/');
    const links = within(screen.getByRole('navigation', { name: 'Secciones' })).getAllByRole(
      'link',
    );
    expect(links.map((l) => l.textContent)).toEqual([
      'Inicio',
      'Cuentas',
      'Movimientos',
      'Presupuestos',
      'Más',
    ]);
  });

  it('shows a not-found page inside the shell for unknown addresses', async () => {
    await renderAt('/no-existe');
    expect(screen.getByRole('heading', { name: 'Esta página no existe' })).toBeTruthy();
    expect(mainNav()).toBeTruthy();
  });
});
