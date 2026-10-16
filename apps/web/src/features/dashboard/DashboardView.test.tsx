import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Panel } from '../../components/Panel';
import { DashboardView } from './DashboardView';
import { SpendingDonut } from './SpendingPanel';
import { SAMPLE_ACCOUNTS, SAMPLE_RECENT, SAMPLE_SPENDING, SAMPLE_SUMMARY } from './sample';

function renderView(element: ReactElement) {
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
    expect(screen.queryByText(/\$|COP/)).toBeNull();
  });

  it('with data, shows the balance, month figures, spending and lists', () => {
    renderView(
      <DashboardView
        summary={SAMPLE_SUMMARY}
        accounts={SAMPLE_ACCOUNTS}
        recent={SAMPLE_RECENT}
        spending={
          <Panel title="Gastos por categoría">
            <SpendingDonut
              slices={SAMPLE_SPENDING}
              total={SAMPLE_SPENDING.reduce((sum, s) => sum + s.amount, 0n)}
              currency="COP"
            />
          </Panel>
        }
      />,
    );
    expect(screen.queryByText('Primeros pasos')).toBeNull();
    expect(screen.getByText('Resumen de octubre')).toBeTruthy();
    expect(screen.getByText('En 3 cuentas')).toBeTruthy();
    expect(screen.getByText('Ingresos de octubre')).toBeTruthy();
    expect(screen.getByText('Cuenta de ahorros')).toBeTruthy();
    const spending = within(screen.getByRole('region', { name: 'Gastos por categoría' }));
    expect(
      spending.getAllByRole('listitem').map((li) => li.querySelectorAll('span')[1]?.textContent),
    ).toEqual(['Vivienda', 'Comida', 'Transporte', 'Salud', 'Ocio']);
    // Vivienda: 1.800.000 of 2.850.000 spent.
    expect(spending.getByText('63 %')).toBeTruthy();
    expect(screen.getByText('Nómina')).toBeTruthy();
  });

  it('colors each change by whether it is good news, not by its direction', () => {
    renderView(<DashboardView summary={SAMPLE_SUMMARY} />);
    // Income rose 3.9M → 4.2M (+8 %): good. Spending rose 2.5M → 2.85M (+14 %): bad.
    expect(screen.getByText(/\+8\s?%/).closest('span.bg-income-soft')).toBeTruthy();
    expect(screen.getByText(/\+14\s?%/).closest('span.bg-expense-soft')).toBeTruthy();
  });
});
