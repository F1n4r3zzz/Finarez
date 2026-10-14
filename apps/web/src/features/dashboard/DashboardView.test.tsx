import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DashboardView } from './DashboardView';
import { SAMPLE_ACCOUNTS, SAMPLE_RECENT, SAMPLE_SUMMARY } from './sample';

function renderView(element: React.ReactElement) {
  const router = createMemoryRouter([{ path: '/', element }]);
  render(<RouterProvider router={router} />);
}

describe('DashboardView', () => {
  it('without data, guides the user through the first steps instead of showing numbers', () => {
    renderView(<DashboardView />);
    expect(
      screen.getByText('Agrega tus cuentas para ver aquí cuánto dinero tienes disponible.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Primeros pasos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Agrega tus cuentas/ }).getAttribute('href')).toBe(
      '/accounts',
    );
    expect(screen.getByRole('link', { name: /Registra o importa/ }).getAttribute('href')).toBe(
      '/transactions',
    );
    expect(screen.getByRole('link', { name: /Define un presupuesto/ }).getAttribute('href')).toBe(
      '/budgets',
    );
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it('with data, shows the balance, the month totals and the lists', () => {
    renderView(
      <DashboardView summary={SAMPLE_SUMMARY} accounts={SAMPLE_ACCOUNTS} recent={SAMPLE_RECENT} />,
    );
    expect(screen.queryByText('Primeros pasos')).toBeNull();
    expect(screen.getByText('Cuenta de ahorros')).toBeTruthy();
    expect(screen.getByText('Nómina')).toBeTruthy();
    expect(screen.getByText(/Entró en octubre/)).toBeTruthy();
  });
});
