import type { Category, MonthlyReport, SummaryReport } from '@finanz/contracts';
import type { LocalDate } from '@finanz/kernel';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi, type Handlers, json, renderApp, signedIn } from '../../test/fake-api';

const day = (d: string) => d as LocalDate;
const MERCADO = 'c-mercado';
const VIVIENDA = 'c-vivienda';
const TRANSPORTE = 'c-transporte';
const GASOLINA = 'c-gasolina';

const CATEGORIES: Category[] = [
  { id: MERCADO, kind: 'expense', parentId: null, name: 'Mercado', archived: false },
  { id: VIVIENDA, kind: 'expense', parentId: null, name: 'Vivienda', archived: false },
  { id: TRANSPORTE, kind: 'expense', parentId: null, name: 'Transporte', archived: false },
  { id: GASOLINA, kind: 'expense', parentId: TRANSPORTE, name: 'Gasolina', archived: false },
];

const complete = {
  currency: 'COP' as const,
  complete: true,
  excluded: [],
  rateIds: [],
  staleRateIds: [],
};

const month = (
  m: string,
  income: number,
  lines: [string, number][],
): MonthlyReport['months'][number] => {
  const expenses = lines.reduce((s, [, v]) => s + v, 0);
  return {
    month: m,
    from: day(`${m}-01`),
    to: day(`${m}-28`),
    incomeMinor: String(income * 100),
    expensesMinor: String(expenses * 100),
    netMinor: String((income - expenses) * 100),
    expensesByCategory: lines.map(([categoryId, v]) => ({
      categoryId,
      amountMinor: String(v * 100),
    })),
  };
};

const MONTHLY: MonthlyReport = {
  from: day('2026-08-01'),
  to: day('2026-10-15'),
  months: [
    month('2026-08', 20_000_000, [
      [VIVIENDA, 3_500_000],
      [MERCADO, 1_200_000],
      [GASOLINA, 400_000],
    ]),
    month('2026-09', 18_000_000, [
      [VIVIENDA, 3_500_000],
      [MERCADO, 1_000_000],
      [TRANSPORTE, 300_000],
    ]),
    month('2026-10', 10_000_000, [[VIVIENDA, 3_500_000]]),
  ],
  ...complete,
};

const PREVIOUS: SummaryReport = {
  from: day('2026-05-01'),
  to: day('2026-07-15'),
  incomeMinor: String(40_000_000 * 100),
  expensesMinor: String(15_400_000 * 100),
  netMinor: String(24_600_000 * 100),
  incomeByCategory: [],
  expensesByCategory: [],
  ...complete,
};

function reportsApi(extra: Handlers = {}) {
  return fakeApi({
    ...signedIn,
    'GET /categories': () => json(CATEGORIES),
    'GET /reports/monthly': () => json(MONTHLY),
    'GET /reports/summary': () => json(PREVIOUS),
    ...extra,
  });
}

describe('Reportes', () => {
  it('sums the period and compares it with the one before', async () => {
    reportsApi();
    renderApp('/reports?period=3m');
    const totals = await screen.findByRole('region', { name: 'Totales del periodo' });
    // 48.000.000 income and 13.400.000 spent (Gasolina rolls into Transporte).
    expect(within(totals).getByText(/48\.000\.000/)).toBeTruthy();
    expect(within(totals).getByText(/13\.400\.000/)).toBeTruthy();
    expect(within(totals).getByText('Ahorraste el 72 % de tus ingresos.')).toBeTruthy();
    expect(within(totals).getAllByText('frente a los 3 meses anteriores')).toHaveLength(2);
  });

  it('charts income and spending per month, with the same figures as a table', async () => {
    reportsApi();
    renderApp('/reports?period=3m');
    const chart = await screen.findByRole('group', { name: /Ingresos y gastos por mes/ });
    expect(chart.querySelectorAll('path')).toHaveLength(6);
    const panel = screen.getByRole('region', { name: 'Ingresos y gastos por mes' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Ver como tabla' }));
    const rows = within(panel).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(rows[2]?.textContent).toMatch(/septiembre.*18\.000\.000.*4\.800\.000.*13\.200\.000/);
  });

  it('ranks categories with subcategories rolled up, and charts the one you pick', async () => {
    const api = reportsApi();
    const router = renderApp('/reports?period=3m');
    const ranking = await screen.findByRole('region', { name: 'En qué gastas' });
    const names = within(ranking)
      .getAllByRole('button', { pressed: false })
      .concat(within(ranking).getAllByRole('button', { pressed: true }))
      .map((b) => b.textContent ?? '');
    expect(names.some((n) => n.startsWith('Vivienda'))).toBe(true);
    // The top category is shown first.
    expect(screen.getByRole('region', { name: 'Gasto en Vivienda por mes' })).toBeTruthy();
    const loads = api.calls.filter((c) => c.path.startsWith('/reports/monthly')).length;

    fireEvent.click(within(ranking).getByRole('button', { name: /^Transporte/ }));
    const transporte = await screen.findByRole('region', { name: 'Gasto en Transporte por mes' });
    expect(within(transporte).getByText('Gasolina')).toBeTruthy();
    // 300.000 was filed on Transporte itself: listed so the parts add up to 700.000.
    expect(within(transporte).getByText('Sin subcategoría').parentElement?.textContent).toMatch(
      /300\.000/,
    );
    expect(within(transporte).getByText(/233\.333/)).toBeTruthy();
    expect(router.state.location.search).toContain('category=c-transporte');
    // Picking a category doesn't reload the report.
    expect(api.calls.filter((c) => c.path.startsWith('/reports/monthly'))).toHaveLength(loads);
  });

  it('reloads for another period', async () => {
    const api = reportsApi();
    renderApp('/reports?period=3m');
    await screen.findByRole('region', { name: 'Totales del periodo' });
    fireEvent.click(screen.getByRole('link', { name: 'Últimos 12 meses' }));
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Últimos 12 meses' }).getAttribute('aria-current'),
      ).toBe('page'),
    );
    const monthly = api.calls.filter((c) => c.path.startsWith('/reports/monthly'));
    expect(monthly.at(-1)?.path).toMatch(/from=\d{4}-\d{2}-01&to=/);
    expect(monthly).toHaveLength(2);
  });

  it('says when a typed period is not valid and shows the last 12 months instead', async () => {
    reportsApi();
    renderApp('/reports?period=custom&from=2026-05-01&to=2026-01-01');
    expect(await screen.findByText(/Ese periodo no sirve/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Últimos 12 meses' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('invites you to pick another period when there is nothing to show', async () => {
    reportsApi({
      'GET /reports/monthly': () => json({ ...MONTHLY, months: [month('2026-10', 0, [])] }),
    });
    renderApp('/reports?period=month');
    expect(await screen.findByText('No hay movimientos en este periodo')).toBeTruthy();
  });
});
