import { act, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { setShowInvestments } from './preferences';
import { routes } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

const mainNav = () => screen.getByRole('navigation', { name: 'Navegación principal' });

describe('AppShell', () => {
  it('lists every section in Spanish and marks the current one', () => {
    renderAt('/accounts');
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

  it('hides the optional investments section when the user turns it off', () => {
    renderAt('/');
    expect(within(mainNav()).queryByRole('link', { name: 'Inversiones' })).toBeTruthy();
    act(() => setShowInvestments(false));
    expect(within(mainNav()).queryByRole('link', { name: 'Inversiones' })).toBeNull();
  });

  it('keeps the mobile bar to five entries ending in "Más"', () => {
    renderAt('/');
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

  it('shows a not-found page inside the shell for unknown addresses', () => {
    renderAt('/no-existe');
    expect(screen.getByRole('heading', { name: 'Esta página no existe' })).toBeTruthy();
    expect(mainNav()).toBeTruthy();
  });
});
