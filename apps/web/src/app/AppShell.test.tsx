import { act, cleanup, screen, within } from '@testing-library/react';
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
    await renderAt('/budgets');
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
    expect(nav.getByRole('link', { name: 'Presupuestos' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(nav.getByRole('link', { name: 'Inicio' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Presupuestos' })).toBeTruthy();
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
      'Reportes',
      'Más',
    ]);
  });

  it('keeps "Más" lit in sections that live inside it', async () => {
    await renderAt('/debts');
    const bar = within(screen.getByRole('navigation', { name: 'Secciones' }));
    expect(bar.getByRole('link', { name: 'Más' }).className).toContain('lit');
    expect(bar.getByRole('link', { name: 'Inicio' }).className).not.toContain('lit');
  });

  it('shows a not-found page inside the shell for unknown addresses', async () => {
    await renderAt('/no-existe');
    expect(screen.getByRole('heading', { name: 'Esta página no existe' })).toBeTruthy();
    expect(mainNav()).toBeTruthy();
  });
});

describe('unfinished sections', () => {
  beforeEach(() => {
    fakeApi(signedIn);
  });

  it('say they are under construction, so nobody expects them to work yet', async () => {
    for (const path of ['/import', '/budgets']) {
      renderApp(path);
      expect(
        await screen.findByText(/Esta sección todavía está en construcción y no funciona/),
      ).toBeTruthy();
      cleanup();
    }
  });

  it('Inicio works: a new user sees the first steps, not a construction notice', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Primeros pasos' })).toBeTruthy();
    expect(screen.queryByText(/en construcción/)).toBeNull();
  });

  it('Ajustes, which works, carries no such notice', async () => {
    renderApp('/settings');
    await screen.findByText('Entraste con ana@example.com.');
    expect(screen.queryByText(/en construcción/)).toBeNull();
  });
});
