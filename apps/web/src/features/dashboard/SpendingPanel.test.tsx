import type { AccountView, Category } from '@finanz/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, json, renderApp, signedIn } from '../../test/fake-api';

const BANK = '01900000-0000-7000-8000-00000000000a';
const ACCOUNTS: AccountView[] = [
  {
    id: BANK,
    name: 'Bancolombia',
    kind: 'asset',
    subtype: 'bank',
    currency: 'COP',
    institution: null,
    openedOn: '2025-09-30' as AccountView['openedOn'],
    archived: false,
    balanceMinor: '500000000',
  },
];
const category = (id: string, name: string, parentId: string | null = null): Category => ({
  id,
  kind: 'expense',
  parentId,
  name,
  archived: false,
});
const CATEGORIES = [
  category('home', 'Vivienda'),
  category('rent', 'Arriendo', 'home'),
  category('food', 'Mercado'),
];
const summary = (from: string, to: string, lines: [string, number][]) => ({
  from,
  to,
  incomeMinor: '0',
  expensesMinor: String(lines.reduce((sum, [, pesos]) => sum + pesos * 100, 0)),
  netMinor: '0',
  incomeByCategory: [],
  expensesByCategory: lines.map(([categoryId, pesos]) => ({
    categoryId,
    amountMinor: String(pesos * 100),
  })),
  currency: 'COP',
  complete: true,
  excluded: [],
  rateIds: [],
  staleRateIds: [],
});

/** Inicio with a bank account; each summary call answers with the next of `answers`. */
function inicioApi(answers: ReturnType<typeof summary>[]) {
  let next = 0;
  return fakeApi({
    ...signedIn,
    'GET /ledger/accounts': () => json(ACCOUNTS),
    'GET /categories': () => json(CATEGORIES),
    'GET /reports/summary': () => json(answers[Math.min(next++, answers.length - 1)]),
  });
}

const panel = () => within(screen.getByRole('region', { name: 'Gastos por categoría' }));
const summaries = (api: ReturnType<typeof fakeApi>) =>
  api.calls.filter((c) => c.path.startsWith('/reports/summary')).map((c) => c.path);

beforeEach(() => {
  // Only the clock: timers stay real so the router and waitFor keep working.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T15:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('spending on Inicio', () => {
  const month = summary('2026-10-01', '2026-10-31', [
    ['rent', 1_800_000],
    ['food', 600_000],
  ]);

  it('shows this month by default: categories with subcategories rolled up, amounts and shares', async () => {
    inicioApi([month, month]);
    renderApp('/');
    await screen.findByRole('region', { name: 'Gastos por categoría' });
    const rows = panel().getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^Vivienda.*1\.800\.000.*75\s?%$/),
      expect.stringMatching(/^Mercado.*600\.000.*25\s?%$/),
    ]);
    expect(panel().getByText('Gastado')).toBeTruthy();
    expect(panel().getByText(/2\.400\.000/)).toBeTruthy();
    expect((panel().getByLabelText('Periodo') as HTMLSelectElement).value).toBe('month');
  });

  it('loads another period when chosen: today, this week, this fortnight', async () => {
    const today = summary('2026-10-15', '2026-10-15', [['food', 45_000]]);
    const api = inicioApi([month, month, today, today, today]);
    renderApp('/');
    await screen.findByRole('region', { name: 'Gastos por categoría' });
    const before = summaries(api).length;

    fireEvent.change(panel().getByLabelText('Periodo'), { target: { value: 'today' } });
    await waitFor(() => expect(panel().getAllByRole('listitem')).toHaveLength(1));
    expect(panel().getByText('Mercado')).toBeTruthy();
    expect(summaries(api).at(-1)).toBe('/reports/summary?from=2026-10-15&to=2026-10-15');

    fireEvent.change(panel().getByLabelText('Periodo'), { target: { value: 'week' } });
    await waitFor(() =>
      expect(summaries(api).at(-1)).toBe('/reports/summary?from=2026-10-12&to=2026-10-15'),
    );
    fireEvent.change(panel().getByLabelText('Periodo'), { target: { value: 'fortnight' } });
    await waitFor(() =>
      expect(summaries(api).at(-1)).toBe('/reports/summary?from=2026-10-01&to=2026-10-15'),
    );
    expect(summaries(api).length).toBe(before + 3);
  });

  it('lets the user pick any range, and says when it is backwards', async () => {
    const range = summary('2026-09-01', '2026-09-30', [['food', 900_000]]);
    const api = inicioApi([month, month, range]);
    renderApp('/');
    await screen.findByRole('region', { name: 'Gastos por categoría' });
    fireEvent.change(panel().getByLabelText('Periodo'), { target: { value: 'custom' } });
    fireEvent.change(panel().getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    fireEvent.change(panel().getByLabelText('Hasta'), { target: { value: '2026-09-30' } });
    await waitFor(() =>
      expect(summaries(api).at(-1)).toBe('/reports/summary?from=2026-09-01&to=2026-09-30'),
    );
    const calls = summaries(api).length;
    fireEvent.change(panel().getByLabelText('Desde'), { target: { value: '2026-10-05' } });
    expect(panel().getByText('Debe ser igual o anterior a la fecha final.')).toBeTruthy();
    expect(summaries(api).length).toBe(calls);
  });

  it('keeps the ring when nothing was spent', async () => {
    const empty = summary('2026-10-01', '2026-10-31', []);
    inicioApi([empty, empty]);
    renderApp('/');
    await screen.findByRole('region', { name: 'Gastos por categoría' });
    expect(panel().getByText('No hay gastos en este periodo.')).toBeTruthy();
    expect(panel().getByText('Gastado')).toBeTruthy();
  });
});

describe('the rest of Inicio', () => {
  const month = summary('2026-10-01', '2026-10-31', [['food', 600_000]]);

  it('compares spending so far this month with the same point last month', async () => {
    const api = inicioApi([month]);
    renderApp('/');
    await screen.findByRole('region', { name: 'Gastos por categoría' });
    expect(summaries(api)).toContain('/reports/summary?from=2026-10-01&to=2026-10-15');
    expect(summaries(api)).toContain('/reports/summary?from=2026-09-01&to=2026-09-15');
  });

  it('warns when a budget leaves out spending for lack of an exchange rate', async () => {
    fakeApi({
      ...signedIn,
      'GET /ledger/accounts': () => json(ACCOUNTS),
      'GET /categories': () => json(CATEGORIES),
      'GET /reports/summary': () => json(month),
      'GET /budgets': () =>
        json([
          {
            id: 'b1',
            categoryId: 'food',
            period: 'monthly',
            currency: 'USD',
            carryover: false,
            startsOn: '2026-01-01',
            archived: false,
            limitMinor: '10000',
            current: {
              from: '2026-10-01',
              to: '2026-10-31',
              limitMinor: '10000',
              carriedMinor: '0',
              availableMinor: '10000',
              spentMinor: '0',
              remainingMinor: '10000',
              overspent: false,
              excluded: [
                { date: '2026-10-05', currency: 'EUR', component: 'expense', amountMinor: '500' },
              ],
            },
          },
        ]),
    });
    renderApp('/');
    expect(await screen.findByText(/Faltan tasas de cambio para EUR/)).toBeTruthy();
  });
});
