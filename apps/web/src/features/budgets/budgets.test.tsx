import type { BudgetPeriodView, BudgetView, Category } from '@finanz/contracts';
import type { LocalDate } from '@finanz/kernel';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, type Handlers, json, renderApp, signedIn } from '../../test/fake-api';

const day = (d: string) => d as LocalDate;
const VIVIENDA = '01900000-0000-7000-8000-0000000000c1';
const ARRIENDO = '01900000-0000-7000-8000-0000000000c2';
const MERCADO = '01900000-0000-7000-8000-0000000000c3';
const HOGAR = '01900000-0000-7000-8000-0000000000c4';
const AGUA = '01900000-0000-7000-8000-0000000000c5';
const VIAJES = '01900000-0000-7000-8000-0000000000c6';
const SALARIO = '01900000-0000-7000-8000-0000000000c7';
const B_MERCADO = '01900000-0000-7000-8000-0000000000b1';
const B_VIVIENDA = '01900000-0000-7000-8000-0000000000b2';
const B_AGUA = '01900000-0000-7000-8000-0000000000b3';
const B_VIAJES = '01900000-0000-7000-8000-0000000000b4';

const category = (id: string, name: string, parentId: string | null = null): Category => ({
  id,
  kind: 'expense',
  parentId,
  name,
  archived: false,
});

const CATEGORIES: Category[] = [
  category(VIVIENDA, 'Vivienda'),
  category(ARRIENDO, 'Arriendo', VIVIENDA),
  category(MERCADO, 'Mercado'),
  category(HOGAR, 'Servicios del hogar'),
  category(AGUA, 'Agua', HOGAR),
  category(VIAJES, 'Viajes'),
  { ...category(SALARIO, 'Salario'), kind: 'income' },
];

const cop = (pesos: number) => String(BigInt(pesos) * 100n);

const period = (over: Partial<BudgetPeriodView>): BudgetPeriodView => ({
  from: day('2026-10-01'),
  to: day('2026-10-31'),
  limitMinor: cop(1_000_000),
  carriedMinor: '0',
  availableMinor: cop(1_000_000),
  spentMinor: '0',
  remainingMinor: cop(1_000_000),
  overspent: false,
  excluded: [],
  ...over,
});

const budget = (over: Partial<BudgetView>): BudgetView => ({
  id: B_MERCADO,
  categoryId: MERCADO,
  period: 'monthly',
  currency: 'COP',
  carryover: false,
  startsOn: day('2025-10-01'),
  archived: false,
  limitMinor: cop(1_100_000),
  current: period({
    limitMinor: cop(1_100_000),
    availableMinor: cop(1_100_000),
    spentMinor: cop(1_246_500),
    remainingMinor: cop(-146_500),
    overspent: true,
  }),
  ...over,
});

const BUDGETS: BudgetView[] = [
  budget({}),
  budget({
    id: B_VIVIENDA,
    categoryId: VIVIENDA,
    carryover: true,
    limitMinor: cop(3_500_000),
    current: period({
      limitMinor: cop(3_500_000),
      carriedMinor: cop(200_000),
      availableMinor: cop(3_700_000),
      spentMinor: cop(3_500_000),
      remainingMinor: cop(200_000),
    }),
  }),
  budget({
    id: B_AGUA,
    categoryId: AGUA,
    period: 'quarterly',
    limitMinor: cop(300_000),
    current: period({
      to: day('2026-12-31'),
      limitMinor: cop(300_000),
      availableMinor: cop(300_000),
      spentMinor: cop(90_000),
      remainingMinor: cop(210_000),
    }),
  }),
  budget({
    id: B_VIAJES,
    categoryId: VIAJES,
    startsOn: day('2026-11-01'),
    limitMinor: cop(500_000),
    current: null,
  }),
];

function budgetsApi(extra: Handlers = {}) {
  return fakeApi({
    ...signedIn,
    'GET /categories': () => json(CATEGORIES),
    'GET /budgets': () => json(BUDGETS),
    ...extra,
  });
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  // Only the clock: timers stay real so the router and waitFor keep working.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T15:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Presupuestos', () => {
  it('shows what is left or overspent in each budget, with carryover and the month totals', async () => {
    budgetsApi();
    renderApp('/budgets');
    const mercado = (await screen.findByText('Mercado')).closest('a');
    if (!mercado) throw new Error('no card');
    expect(mercado.getAttribute('href')).toBe(`/budgets/${B_MERCADO}`);
    expect(within(mercado).getByText('Te pasaste por')).toBeTruthy();
    expect(within(mercado).getByText(/146\.500/)).toBeTruthy();
    expect(
      within(mercado).getByText(/^Gastaste 1\.246\.500.* de 1\.100\.000.*\. Quedan 17 días\.$/),
    ).toBeTruthy();

    const vivienda = screen.getByText('Vivienda').closest('a') as HTMLElement;
    expect(within(vivienda).getByText('Mensual, con sus subcategorías')).toBeTruthy();
    expect(within(vivienda).getByText(/^Incluye 200\.000.* que te sobró antes\.$/)).toBeTruthy();

    const agua = screen.getByText('Agua').closest('a') as HTMLElement;
    expect(
      within(agua).getByText(
        'Trimestral, dentro de Servicios del hogar: octubre a diciembre de 2026',
      ),
    ).toBeTruthy();

    expect(
      screen.getByText(/^Empieza en noviembre de 2026, con un límite de 500\.000.*\.$/),
    ).toBeTruthy();
    expect(screen.getByText(/4\.746\.500/)).toBeTruthy();
    expect(screen.getByText(/de .*4\.800\.000/)).toBeTruthy();
    expect(screen.getByText('1 presupuesto pasado del límite')).toBeTruthy();
    // Overspent first, then by category.
    const cards = within(mercado.closest('ul') as HTMLElement).getAllByRole('listitem');
    expect(cards.map((li) => li.querySelector('.font-semibold')?.textContent)).toEqual([
      'Mercado',
      'Agua',
      'Viajes',
      'Vivienda',
    ]);
  });

  it('moves between months through the URL', async () => {
    const api = budgetsApi();
    renderApp('/budgets?month=2026-09');
    await screen.findByText('Mercado');
    expect(api.calls.some((c) => c.path === '/budgets?on=2026-09-01')).toBe(true);
    expect(screen.getByText('septiembre de 2026')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mes anterior' }).getAttribute('href')).toBe(
      '/budgets?month=2026-08',
    );
    expect(screen.getByRole('link', { name: 'Mes siguiente' }).getAttribute('href')).toBe(
      '/budgets',
    );
  });

  it('invites to create the first budget', async () => {
    budgetsApi({ 'GET /budgets': () => json([]) });
    renderApp('/budgets');
    expect(await screen.findByText('Todavía no tienes presupuestos')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nuevo presupuesto' }).getAttribute('href')).toBe(
      '/budgets/new',
    );
  });
});

describe('A new budget', () => {
  it('offers expense categories by group, leaving out the ones with a budget', async () => {
    budgetsApi();
    renderApp('/budgets/new');
    const select = await screen.findByLabelText('Categoría');
    const group = within(select).getByRole('group', { name: 'Vivienda' });
    const names = within(group)
      .getAllByRole('option')
      .map((o) => [o.textContent, (o as HTMLOptionElement).disabled]);
    expect(names).toEqual([
      ['Vivienda (ya tiene presupuesto)', true],
      ['Arriendo', false],
    ]);
    expect(within(select).queryByRole('option', { name: 'Salario' })).toBeNull();
  });

  it('is created once, from the chosen month, and opens', async () => {
    const api = budgetsApi({
      'POST /budgets': () => json(budget({ id: B_AGUA, categoryId: ARRIENDO }), 201),
      [`GET /budgets/${B_AGUA}`]: () => json(budget({ id: B_AGUA, categoryId: ARRIENDO })),
      [`GET /budgets/${B_AGUA}/history`]: () => json([]),
    });
    const router = renderApp('/budgets/new');
    await screen.findByLabelText('Categoría');
    type('Categoría', ARRIENDO);
    fireEvent.click(screen.getByRole('radio', { name: 'Trimestral' }));
    type('Límite por trimestre', '900.000');
    type('Desde', '2026-11');
    fireEvent.click(screen.getByRole('checkbox', { name: /Pasar al siguiente periodo/ }));
    const submit = screen.getByRole('button', { name: 'Crear presupuesto' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/budgets/${B_AGUA}`));
    const posts = api.actions().filter((c) => c.path === '/budgets');
    expect(new Set(posts.map((p) => p.headers?.['Idempotency-Key'])).size).toBe(1);
    expect(posts[0]?.body).toEqual({
      categoryId: ARRIENDO,
      period: 'quarterly',
      currency: 'COP',
      amountMinor: cop(900_000),
      carryover: true,
      startsOn: '2026-11-01',
    });
  });

  it('says why when the category already has one', async () => {
    budgetsApi({
      'POST /budgets': () =>
        json({ error: { code: 'budgets.duplicate_category', message: '' } }, 409),
    });
    renderApp('/budgets/new');
    await screen.findByLabelText('Categoría');
    type('Categoría', ARRIENDO);
    type('Límite al mes', '1.000.000');
    fireEvent.click(screen.getByRole('button', { name: 'Crear presupuesto' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Esa categoría ya tiene un presupuesto. Edítalo o archívalo primero.',
    );
  });
});

describe('A budget', () => {
  const vivienda = BUDGETS[1] as BudgetView;
  const HISTORY: BudgetPeriodView[] = [
    period({ from: day('2026-08-01'), to: day('2026-08-31'), spentMinor: cop(900_000) }),
    period({
      from: day('2026-09-01'),
      to: day('2026-09-30'),
      spentMinor: cop(1_200_000),
      remainingMinor: cop(-200_000),
      overspent: true,
    }),
    period({ spentMinor: cop(300_000) }),
  ];

  it('shows its period, its history and asks before archiving', async () => {
    const api = budgetsApi({
      [`GET /budgets/${B_MERCADO}`]: () => json(BUDGETS[0]),
      [`GET /budgets/${B_MERCADO}/history`]: () => json(HISTORY),
      [`POST /budgets/${B_MERCADO}/archive`]: () => json({ ...BUDGETS[0], archived: true }),
    });
    renderApp(`/budgets/${B_MERCADO}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Mercado' })).toBeTruthy();
    expect(screen.getByText('Mensual, desde octubre de 2025')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'octubre de 2026' })).toBeTruthy();
    expect(screen.getByText('Te pasaste del límite en 1 de los últimos 3 meses.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Archivar presupuesto' }));
    expect(screen.getByText(/¿Archivar este presupuesto\?/)).toBeTruthy();
    expect(api.actions()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Archivar presupuesto' }));
    await waitFor(() =>
      expect(api.actions().map((c) => c.path)).toEqual([`/budgets/${B_MERCADO}/archive`]),
    );
  });

  it('changes its limit from a month on', async () => {
    const api = budgetsApi({
      [`GET /budgets/${B_VIVIENDA}`]: () => json(vivienda),
      [`GET /budgets/${B_VIVIENDA}/history`]: () => json(HISTORY),
      [`PATCH /budgets/${B_VIVIENDA}`]: () => json(vivienda),
    });
    const router = renderApp(`/budgets/${B_VIVIENDA}/edit`);
    const amount = await screen.findByLabelText('Límite al mes');
    expect((amount as HTMLInputElement).value).toBe('3.500.000');
    type('Límite al mes', '4.000.000');
    type('Aplicar el límite desde', '2026-11');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/budgets/${B_VIVIENDA}`));
    expect(api.actions()[0]?.body).toEqual({
      amountMinor: cop(4_000_000),
      from: '2026-11-01',
      carryover: true,
    });
  });

  it('saves only the carryover when the limit stays the same', async () => {
    const api = budgetsApi({
      [`GET /budgets/${B_VIVIENDA}`]: () => json(vivienda),
      [`GET /budgets/${B_VIVIENDA}/history`]: () => json(HISTORY),
      [`PATCH /budgets/${B_VIVIENDA}`]: () => json(vivienda),
    });
    renderApp(`/budgets/${B_VIVIENDA}/edit`);
    await screen.findByLabelText('Límite al mes');
    fireEvent.click(screen.getByRole('checkbox', { name: /Pasar al siguiente periodo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.actions()).toHaveLength(1));
    expect(api.actions()[0]?.body).toEqual({ carryover: false });
  });
});
