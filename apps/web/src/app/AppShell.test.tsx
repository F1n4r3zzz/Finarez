import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp, signedIn } from '../test/fake-api';
import { setShowInvestments } from './preferences';

const renderAt = async (path: string) => {
  renderApp(path);
  await screen.findByRole('navigation', { name: 'Navegación principal' });
};

const mainNav = () => within(screen.getByRole('navigation', { name: 'Navegación principal' }));
const phoneBar = () => within(screen.getByRole('navigation', { name: 'Secciones' }));
const moreButton = () => mainNav().getByRole('button', { name: /^Más/ });
const names = (links: HTMLElement[]) =>
  links.map((l) => l.getAttribute('aria-label') ?? l.textContent);

beforeEach(() => {
  fakeApi(signedIn);
});

describe('AppShell', () => {
  it('shows five sections and Más in the top menu and marks the current one', async () => {
    await renderAt('/budgets');
    for (const label of ['Inicio', 'Cuentas', 'Movimientos', 'Presupuestos', 'Reportes']) {
      expect(mainNav().getByRole('link', { name: label })).toBeTruthy();
    }
    expect(mainNav().getByRole('link', { name: 'Ajustes' })).toBeTruthy();
    expect(moreButton().getAttribute('aria-expanded')).toBe('false');
    expect(mainNav().queryByRole('link', { name: 'Ahorros' })).toBeNull();
    expect(mainNav().getByRole('link', { name: 'Presupuestos' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(mainNav().getByRole('link', { name: 'Inicio' }).getAttribute('aria-current')).toBeNull();
  });

  it('Más opens the other sections and closes with Escape', async () => {
    await renderAt('/');
    act(() => moreButton().click());
    expect(moreButton().getAttribute('aria-expanded')).toBe('true');
    for (const label of ['Ahorros', 'Deudas', 'Patrimonio', 'Inversiones', 'Importar']) {
      expect(mainNav().getByRole('link', { name: label })).toBeTruthy();
    }
    fireEvent.keyDown(mainNav().getByRole('link', { name: 'Deudas' }), { key: 'Escape' });
    expect(moreButton().getAttribute('aria-expanded')).toBe('false');
    expect(mainNav().queryByRole('link', { name: 'Deudas' })).toBeNull();
    expect(document.activeElement).toBe(moreButton());

    act(() => moreButton().click());
    act(() => mainNav().getByRole('link', { name: 'Deudas' }).click());
    expect(await screen.findByRole('heading', { level: 1, name: 'Deudas' })).toBeTruthy();
    expect(moreButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('lights Más when the current section lives in it', async () => {
    await renderAt('/debts');
    expect(moreButton().dataset.current).toBe('true');
    cleanup();
    await renderAt('/');
    expect(moreButton().dataset.current).toBeUndefined();
  });

  it('hides Inversiones from Más when the user turns it off', async () => {
    await renderAt('/');
    act(() => moreButton().click());
    expect(mainNav().queryByRole('link', { name: 'Inversiones' })).toBeTruthy();
    act(() => setShowInvestments(false));
    expect(mainNav().queryByRole('link', { name: 'Inversiones' })).toBeNull();
  });

  it('keeps the phone bar to Inicio, Movimientos, Registrar, Reportes and Más', async () => {
    await renderAt('/');
    const links = phoneBar().getAllByRole('link');
    expect(names(links)).toEqual([
      'Inicio',
      'Movimientos',
      'Registrar movimiento',
      'Reportes',
      'Más',
    ]);
    expect(links[2]?.getAttribute('href')).toBe('/transactions/new');
  });

  it('keeps "Más" lit in sections that live inside it', async () => {
    for (const path of ['/debts', '/accounts']) {
      await renderAt(path);
      expect(phoneBar().getByRole('link', { name: 'Más' }).className).toContain('lit');
      expect(phoneBar().getByRole('link', { name: 'Inicio' }).className).not.toContain('lit');
      cleanup();
    }
  });

  it('hides the phone bar while a movement is being written', async () => {
    await renderAt('/transactions/new');
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).toBeNull();
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
    for (const path of ['/import', '/net-worth']) {
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
