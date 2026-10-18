import { money } from '@finanz/kernel';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BandSlotProvider, BandSlotTarget } from '../../app/band';
import { Panel } from '../../components/Panel';
import { type AccountTile, type BudgetRow, DashboardView } from './DashboardView';
import { SpendingDonut } from './SpendingPanel';
import {
  SAMPLE_BUDGETS,
  SAMPLE_HERO,
  SAMPLE_MONTH,
  SAMPLE_RECENT,
  SAMPLE_SPENDING,
  SAMPLE_TILES,
  SAMPLE_UPCOMING,
} from './sample';

const cop = (pesos: number) => money(BigInt(pesos) * 100n, 'COP');
/** Text with the non-breaking spaces of money and percent formats read as plain spaces. */
const text = (element: Element) => element.textContent?.replace(/\s+/g, ' ');

function renderView(element: ReactElement) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <BandSlotProvider>
          <main>
            <BandSlotTarget className="band" />
            {element}
          </main>
        </BandSlotProvider>
      ),
    },
  ]);
  return render(<RouterProvider router={router} />);
}

const full = (overrides: Partial<Parameters<typeof DashboardView>[0]> = {}) => (
  <DashboardView
    hero={SAMPLE_HERO}
    accounts={SAMPLE_TILES}
    month={SAMPLE_MONTH}
    budgets={SAMPLE_BUDGETS}
    upcoming={SAMPLE_UPCOMING}
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
    {...overrides}
  />
);

// Amounts as a Colombian browser shows them ("$ 12.450.000").
beforeEach(() => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CO']);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardView', () => {
  it('without data, guides the user through the first steps instead of showing numbers', async () => {
    renderView(<DashboardView />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Inicio' })).toBeTruthy();
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

  it('puts the balance on the band with net worth and what is left this month', async () => {
    const { container } = renderView(full());
    const band = within(container.querySelector('.band') as HTMLElement);
    expect(await band.findByRole('heading', { level: 1, name: 'Inicio' })).toBeTruthy();
    expect(band.getByText('Disponible hoy')).toBeTruthy();
    expect(band.getByText('$ 12.450.000')).toBeTruthy();
    expect(text(band.getByText(/Patrimonio/))).toBe('Patrimonio $ 21.300.000');
    // 4.200.000 in, 2.850.000 out.
    expect(text(band.getByText(/En octubre/))).toBe('En octubre te quedan $ 1.350.000');
  });

  it('says so when this month spent more than came in, and stays quiet with no movements', async () => {
    const over = { income: cop(1_000_000), expenses: cop(1_500_000), monthName: 'octubre' };
    const { container, unmount } = renderView(full({ month: over }));
    const band = within(container.querySelector('.band') as HTMLElement);
    expect(text(await band.findByText(/En octubre/))).toBe(
      'En octubre gastaste $ 500.000 más de lo que entró',
    );
    expect(screen.getByRole('img', { name: 'Gastaste más de lo que entró' })).toBeTruthy();
    unmount();

    renderView(full({ month: { income: cop(0), expenses: cop(0), monthName: 'octubre' } }));
    await screen.findByText('Disponible hoy');
    expect(screen.queryByText(/En octubre/)).toBeNull();
    expect(screen.getByRole('img', { name: 'Sin movimientos este mes' })).toBeTruthy();
  });

  it('shows each account as a tile in its own currency, debts marked as owed', async () => {
    renderView(full());
    const tiles = within(await screen.findByRole('region', { name: 'Tus cuentas' }));
    expect(tiles.getByText('Interactive Brokers')).toBeTruthy();
    expect(tiles.getByText('US$ 2.380,50')).toBeTruthy();
    expect(tiles.getByText('-$ 27.412.169')).toBeTruthy();
    expect(tiles.getByText('Lo que debes')).toBeTruthy();
  });

  it('offers all accounts when there are more than five tiles', async () => {
    const many: AccountTile[] = Array.from({ length: 7 }, (_, i) => ({
      id: `a${i}`,
      name: `Cuenta ${i + 1}`,
      kind: 'Cuenta bancaria',
      balance: cop(1_000 * (i + 1)),
      debt: false,
    }));
    renderView(full({ accounts: many }));
    const link = await screen.findByRole('link', { name: 'Ver todas (7)' });
    expect(link.getAttribute('href')).toBe('/accounts');
  });

  it('draws the month as a ring and compares spending with the same point last month', async () => {
    renderView(full({ pace: { delta: cop(250_000), monthName: 'septiembre' } }));
    // 2.850.000 of 4.200.000.
    expect(
      await screen.findByRole('img', { name: /^Gastaste el 68\s?%\sde lo que entró$/ }),
    ).toBeTruthy();
    expect(
      screen.getByText('Llevas $ 250.000 más en gastos que a esta altura de septiembre.'),
    ).toBeTruthy();
  });

  it('says when spending runs lower than last month, and says nothing without a comparison', async () => {
    const { unmount } = renderView(
      full({ pace: { delta: cop(-120_000), monthName: 'septiembre' } }),
    );
    expect(
      await screen.findByText('Llevas $ 120.000 menos en gastos que a esta altura de septiembre.'),
    ).toBeTruthy();
    unmount();
    renderView(full());
    await screen.findByText('Disponible hoy');
    expect(screen.queryByText(/a esta altura de/)).toBeNull();
  });

  it('lists budgets with the overspent ones first, at most four', async () => {
    const budgets: BudgetRow[] = [
      { id: 'b1', name: 'Mercado', spent: cop(480_000), available: cop(700_000), overspent: false },
      {
        id: 'b2',
        name: 'Transporte',
        spent: cop(210_000),
        available: cop(350_000),
        overspent: false,
      },
      { id: 'b3', name: 'Ropa', spent: cop(10_000), available: cop(100_000), overspent: false },
      { id: 'b4', name: 'Salud', spent: cop(20_000), available: cop(100_000), overspent: false },
      {
        id: 'b5',
        name: 'Restaurantes',
        spent: cop(200_000),
        available: cop(180_000),
        overspent: true,
      },
    ];
    renderView(full({ budgets }));
    const panel = within(await screen.findByRole('region', { name: 'Presupuestos' }));
    const names = panel.getAllByRole('listitem').map((li) => li.querySelector('span')?.textContent);
    expect(names).toEqual(['Restaurantes', 'Mercado', 'Transporte', 'Ropa']);
    expect(panel.getByText('Te pasaste $ 20.000')).toBeTruthy();
  });

  it('lists what is coming, with a way to confirm, or says nothing is pending', async () => {
    const { unmount } = renderView(full());
    const panel = within(await screen.findByRole('region', { name: 'Próximos' }));
    expect(panel.getByText('Plan celular Claro')).toBeTruthy();
    expect(panel.getByRole('link', { name: 'Confirmar' }).getAttribute('href')).toBe(
      '/transactions/recurring',
    );
    unmount();
    renderView(full({ upcoming: [] }));
    expect(await screen.findByText('Nada pendiente en los próximos 14 días.')).toBeTruthy();
  });

  it('shows a movement without a category by its date alone', async () => {
    renderView(
      full({
        recent: [
          {
            id: 'v1',
            date: SAMPLE_RECENT[0]?.date ?? ('2026-10-13' as never),
            description: 'Valoración VOO',
            category: '',
            amount: cop(120),
          },
        ],
      }),
    );
    const recent = within(await screen.findByRole('region', { name: 'Últimos movimientos' }));
    const row = recent.getByText('Valoración VOO').closest('li') as HTMLElement;
    expect(text(row)).not.toMatch(/,\s\d/);
    expect(row.textContent).not.toContain('?');
  });

  it('keeps the spending panel, the latest movements and any notice', async () => {
    renderView(full({ notice: <p>Faltan tasas de cambio para USD</p> }));
    expect(await screen.findByText('Faltan tasas de cambio para USD')).toBeTruthy();
    const spending = within(screen.getByRole('region', { name: 'Gastos por categoría' }));
    expect(spending.getByText('Vivienda')).toBeTruthy();
    expect(screen.getByText('Nómina')).toBeTruthy();
  });
});
