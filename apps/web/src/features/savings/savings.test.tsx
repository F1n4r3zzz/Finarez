import type { AccountView, AllocationView, GoalView, SavingsAccountView } from '@finanz/contracts';
import type { LocalDate } from '@finanz/kernel';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi, type Handlers, json, renderApp, signedIn } from '../../test/fake-api';

const day = (d: string) => d as LocalDate;
const BANK = '01900000-0000-7000-8000-00000000000a';
const FUND = '01900000-0000-7000-8000-00000000000b';
const WISE = '01900000-0000-7000-8000-00000000000c';
const VISA = '01900000-0000-7000-8000-00000000000d';
const EMERGENCY = '01900000-0000-7000-8000-0000000000e1';
const TRIP = '01900000-0000-7000-8000-0000000000e2';
const ALLOCATION = '01900000-0000-7000-8000-0000000000f1';

const account = (
  id: string,
  name: string,
  subtype: AccountView['subtype'],
  currency: AccountView['currency'],
): AccountView => ({
  id,
  name,
  kind: subtype === 'credit_card' ? 'liability' : 'asset',
  subtype,
  currency,
  institution: null,
  openedOn: day('2025-09-30'),
  archived: false,
  balanceMinor: '0',
});

const ACCOUNTS = [
  account(BANK, 'Bancolombia', 'bank', 'COP'),
  account(FUND, 'Fondo Bancolombia', 'investment', 'COP'),
  account(WISE, 'Wise', 'bank', 'USD'),
  account(VISA, 'Visa', 'credit_card', 'COP'),
];

const goal = (over: Partial<GoalView>): GoalView => ({
  id: EMERGENCY,
  name: 'Fondo de emergencia',
  currency: 'COP',
  targetMinor: '6000000000',
  targetDate: day('2026-12-31'),
  archived: false,
  savedMinor: '3600000000',
  byAccount: [{ accountId: FUND, amountMinor: '3600000000' }],
  monthlyNeededMinor: '800000000',
  excluded: [],
  ...over,
});

const GOALS = [
  goal({}),
  goal({
    id: TRIP,
    name: 'Viaje a Japón',
    targetMinor: '2500000000',
    targetDate: null,
    savedMinor: '0',
    byAccount: [],
    monthlyNeededMinor: null,
  }),
];

const FREE: SavingsAccountView[] = [
  {
    accountId: FUND,
    currency: 'COP',
    balanceMinor: '7385587600',
    allocatedMinor: '3600000000',
    availableMinor: '3785587600',
  },
  {
    accountId: BANK,
    currency: 'COP',
    balanceMinor: '10000000',
    allocatedMinor: '50000000',
    availableMinor: '-40000000',
  },
];

const HISTORY: AllocationView[] = [
  {
    id: ALLOCATION,
    goalId: EMERGENCY,
    accountId: FUND,
    amountMinor: '180000000',
    occurredOn: day('2025-10-27'),
    note: null,
    transactionId: '01900000-0000-7000-8000-0000000000aa',
    voided: false,
  },
];

function savingsApi(extra: Handlers = {}) {
  return fakeApi({
    ...signedIn,
    'GET /ledger/accounts': () => json(ACCOUNTS),
    'GET /savings/goals': () => json(GOALS),
    'GET /savings/accounts': () => json(FREE),
    [`GET /savings/goals/${EMERGENCY}/allocations`]: () => json(HISTORY),
    [`GET /savings/goals/${TRIP}/allocations`]: () => json([]),
    ...extra,
  });
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Ahorros', () => {
  it('shows each goal with its progress, its pace and the money left free per account', async () => {
    savingsApi();
    renderApp('/savings');
    const card = (await screen.findByText('Fondo de emergencia')).closest('a');
    if (!card) throw new Error('no card');
    expect(card.getAttribute('href')).toBe(`/savings/${EMERGENCY}`);
    expect(within(card).getByText(/Llevas el 60\s?% de .*60\.000\.000/)).toBeTruthy();
    expect(within(card).getByText(/Ahorra .*8\.000\.000.* al mes/)).toBeTruthy();
    expect(screen.getByText('Sin fecha límite')).toBeTruthy();
    const free = screen.getByRole('region', { name: 'Dinero libre por cuenta' });
    expect(within(free).getByText('Apartaste más de lo que hay en esta cuenta.')).toBeTruthy();
  });

  it('asks for an account first when there is nowhere to save', async () => {
    savingsApi({
      'GET /ledger/accounts': () => json([account(VISA, 'Visa', 'credit_card', 'COP')]),
      'GET /savings/goals': () => json([]),
    });
    renderApp('/savings');
    expect(await screen.findByText(/necesitas al menos una cuenta/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Agregar cuenta' }).getAttribute('href')).toBe(
      '/accounts/new',
    );
  });

  it('creates a goal with its target and date, once, and opens it', async () => {
    const api = savingsApi({ 'POST /savings/goals': () => json(GOALS[1], 201) });
    const router = renderApp('/savings/new');
    await screen.findByRole('heading', { name: 'Nueva meta' });
    type('Nombre', 'Viaje a Japón');
    type('Cuánto quieres ahorrar', '25.000.000');
    type('Para cuándo (opcional)', '2027-06-30');
    const submit = screen.getByRole('button', { name: 'Crear meta' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/savings/${TRIP}`));
    const posts = api.actions().filter((c) => c.path === '/savings/goals');
    expect(new Set(posts.map((p) => p.headers?.['Idempotency-Key'])).size).toBe(1);
    expect(posts[0]?.body).toEqual({
      name: 'Viaje a Japón',
      currency: 'COP',
      targetMinor: '2500000000',
      targetDate: '2027-06-30',
    });
  });
});

describe('A goal', () => {
  it('contributes, moving the money from another account in the same currency', async () => {
    const api = savingsApi({
      [`POST /savings/goals/${EMERGENCY}/allocations`]: () => json(HISTORY[0], 201),
    });
    renderApp(`/savings/${EMERGENCY}`);
    await screen.findByRole('heading', { name: 'Fondo de emergencia' });
    type('Cuenta', FUND);
    type('Valor', '1.800.000');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mover el dinero desde otra cuenta' }));
    const from = screen.getByLabelText('Desde');
    // Only active accounts in the same currency can send it.
    expect(within(from).queryByRole('option', { name: 'Wise' })).toBeNull();
    expect(within(from).queryByRole('option', { name: 'Visa' })).toBeNull();
    fireEvent.change(from, { target: { value: BANK } });
    fireEvent.click(screen.getByRole('button', { name: 'Aportar' }));
    expect(await screen.findByText('Listo.')).toBeTruthy();
    expect(api.actions()[0]?.body).toEqual({
      direction: 'contribute',
      accountId: FUND,
      fromAccountId: BANK,
      amountMinor: '180000000',
      occurredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('withdraws only from accounts that hold money for the goal', async () => {
    const api = savingsApi({
      [`POST /savings/goals/${EMERGENCY}/allocations`]: () =>
        json({ error: { code: 'savings.withdraw_exceeds', message: '' } }, 422),
    });
    renderApp(`/savings/${EMERGENCY}`);
    await screen.findByRole('heading', { name: 'Fondo de emergencia' });
    fireEvent.click(screen.getByRole('radio', { name: 'Retirar' }));
    const from = screen.getByLabelText('De qué cuenta');
    expect(
      within(from)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([expect.stringMatching(/^Fondo Bancolombia \(.*36\.000\.000.* apartado\)$/)]);
    type('Valor', '40.000.000');
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'La meta no tiene tanto apartado en esa cuenta.',
    );
    expect(api.actions()[0]?.body).toMatchObject({ direction: 'withdraw', accountId: FUND });
  });

  it('undoes a contribution after asking, warning that its transfer goes too', async () => {
    const api = savingsApi({
      [`POST /savings/goals/${EMERGENCY}/allocations/${ALLOCATION}/void`]: () => json({ ok: true }),
    });
    renderApp(`/savings/${EMERGENCY}`);
    const history = await screen.findByRole('region', { name: 'Historial' });
    expect(within(history).getByText('Aporte movido a Fondo Bancolombia')).toBeTruthy();
    fireEvent.click(within(history).getByRole('button', { name: 'Anular' }));
    expect(within(history).getByText(/También se anula la transferencia/)).toBeTruthy();
    fireEvent.click(within(history).getByRole('button', { name: 'Anular' }));
    await waitFor(() => expect(api.actions()).toHaveLength(1));
    expect(api.actions()[0]?.path).toBe(
      `/savings/goals/${EMERGENCY}/allocations/${ALLOCATION}/void`,
    );
  });

  it('archives a goal only once nothing is set aside for it', async () => {
    savingsApi();
    renderApp(`/savings/${EMERGENCY}`);
    await screen.findByRole('heading', { name: 'Fondo de emergencia' });
    const button = screen.getByRole('button', { name: 'Archivar meta' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Para archivarla, primero retira lo que tiene apartado.')).toBeTruthy();
  });

  it('archives an empty goal', async () => {
    const api = savingsApi({
      [`POST /savings/goals/${TRIP}/archive`]: () => json({ ...GOALS[1], archived: true }),
    });
    renderApp(`/savings/${TRIP}`);
    await screen.findByRole('heading', { name: 'Viaje a Japón' });
    fireEvent.click(screen.getByRole('button', { name: 'Archivar meta' }));
    await waitFor(() =>
      expect(api.actions().map((c) => c.path)).toEqual([`/savings/goals/${TRIP}/archive`]),
    );
  });
});
