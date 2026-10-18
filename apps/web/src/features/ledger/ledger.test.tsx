import type { AccountView, Category, TransactionView } from '@finanz/contracts';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, type Handlers, json, renderApp, signedIn } from '../../test/fake-api';
import { transactionsShouldRevalidate } from './TransactionsPage';

const BANK = '01900000-0000-7000-8000-00000000000a';
const VISA = '01900000-0000-7000-8000-00000000000b';
const WISE = '01900000-0000-7000-8000-00000000000c';
const FUND = '01900000-0000-7000-8000-00000000000d';
const MERCADO = '01900000-0000-7000-8000-0000000000c1';
const SALARIO = '01900000-0000-7000-8000-0000000000c2';

const account = (
  id: string,
  name: string,
  subtype: AccountView['subtype'],
  currency: AccountView['currency'],
  balanceMinor: string,
): AccountView => ({
  id,
  name,
  kind: subtype === 'credit_card' ? 'liability' : 'asset',
  subtype,
  currency,
  institution: null,
  openedOn: '2025-09-30' as AccountView['openedOn'],
  archived: false,
  balanceMinor,
});

const ACCOUNTS = [
  account(BANK, 'Bancolombia', 'bank', 'COP', '1850000000'),
  account(VISA, 'Visa', 'credit_card', 'COP', '-234000000'),
  account(WISE, 'Wise', 'bank', 'USD', '215000'),
];
const CATEGORIES: Category[] = [
  { id: MERCADO, kind: 'expense', parentId: null, name: 'Mercado', archived: false },
  { id: SALARIO, kind: 'income', parentId: null, name: 'Salario', archived: false },
];

const lunch: TransactionView = {
  id: '01900000-0000-7000-8000-0000000000f1',
  occurredOn: '2026-03-10' as TransactionView['occurredOn'],
  kind: 'expense',
  status: 'posted',
  managedBy: null,
  description: 'Mercado del mes',
  payee: null,
  notes: null,
  version: 1,
  entries: [
    {
      id: 'e1',
      accountId: BANK,
      accountKind: 'asset',
      currency: 'COP',
      amountMinor: '-31000000',
      categoryId: null,
      memo: null,
      reconciled: false,
    },
    {
      id: 'e2',
      accountId: 'x',
      accountKind: 'expense',
      currency: 'COP',
      amountMinor: '31000000',
      categoryId: MERCADO,
      memo: null,
      reconciled: false,
    },
  ],
};

function ledgerApi(extra: Handlers = {}) {
  return fakeApi({
    ...signedIn,
    'GET /ledger/accounts': () => json(ACCOUNTS),
    'GET /categories': () => json(CATEGORIES),
    'GET /ledger/transactions': () => json([lunch]),
    [`GET /ledger/transactions/${lunch.id}`]: () => json(lunch),
    ...extra,
  });
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Cuentas', () => {
  it('groups accounts into available, saved or invested and owed, each with its totals', async () => {
    ledgerApi({
      'GET /ledger/accounts': () =>
        json([...ACCOUNTS, account(FUND, 'Fondo de inversión', 'investment', 'COP', '500000000')]),
      'GET /reports/net-worth': () =>
        json({
          on: '2026-10-14',
          totalMinor: '2116000000',
          assetsMinor: '2350000000',
          liabilitiesMinor: '-234000000',
          byAccount: [],
          currency: 'COP',
          complete: true,
          excluded: [],
          rateIds: [],
          staleRateIds: [],
        }),
    });
    renderApp('/accounts');
    const available = await screen.findByRole('region', { name: 'Disponible' });
    expect(within(available).getByText('Bancolombia')).toBeTruthy();
    expect(within(available).getByText('Total en USD')).toBeTruthy();
    const saved = screen.getByRole('region', { name: 'Ahorros e inversiones' });
    expect(within(saved).getByText('Fondo de inversión')).toBeTruthy();
    const owe = screen.getByRole('region', { name: 'Lo que debes' });
    // Debts carry their minus sign, in the alarm color, like on Inicio.
    const owed = within(owe).getAllByText(/^-.*2\.340\.000/);
    expect(owed).toHaveLength(2);
    expect(owed[0]?.className).toContain('text-expense');
    expect(screen.getByText(/^Tu patrimonio:/).textContent).toMatch(/21\.160\.000/);
    const row = within(available).getByText('Bancolombia').closest('a') as HTMLElement;
    expect(row.getAttribute('href')).toBe(`/transactions?account=${BANK}`);
  });

  it('says when net worth leaves out a currency without an exchange rate', async () => {
    ledgerApi({
      'GET /reports/net-worth': () =>
        json({
          on: '2026-10-14',
          totalMinor: '1616000000',
          assetsMinor: '1850000000',
          liabilitiesMinor: '-234000000',
          byAccount: [],
          currency: 'COP',
          complete: false,
          excluded: [
            { date: '2026-10-14', currency: 'USD', component: 'balance', amountMinor: '215000' },
          ],
          rateIds: [],
          staleRateIds: [],
        }),
    });
    renderApp('/accounts');
    expect((await screen.findByText(/^Tu patrimonio/)).textContent).toMatch(
      /^Tu patrimonio sin contar USD: .*16\.160\.000.*\. Falta su tasa de cambio\.$/,
    );
  });

  it('leaves out groups without accounts', async () => {
    ledgerApi();
    renderApp('/accounts');
    await screen.findByRole('region', { name: 'Disponible' });
    expect(screen.queryByRole('region', { name: 'Ahorros e inversiones' })).toBeNull();
  });

  it('creates an account; a debt typed without a sign is stored as owed', async () => {
    const api = ledgerApi({ 'POST /ledger/accounts': () => json(ACCOUNTS[1], 201) });
    const router = renderApp('/accounts/new');
    await screen.findByRole('heading', { name: 'Nueva cuenta' });
    type('Nombre', 'Mastercard');
    type('Tipo', 'credit_card');
    expect(await screen.findByLabelText('Deuda ese día')).toBeTruthy();
    type('Deuda ese día', '1.250.000');
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await screen.findByRole('region', { name: 'Lo que debes' });
    expect(router.state.location.pathname).toBe('/accounts');
    expect(api.actions()[0]?.headers?.['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.actions()[0]).toMatchObject({
      method: 'POST',
      path: '/ledger/accounts',
      body: {
        name: 'Mastercard',
        subtype: 'credit_card',
        currency: 'COP',
        openingBalanceMinor: '-125000000',
      },
    });
  });

  it('says which field to fix', async () => {
    const api = ledgerApi();
    renderApp('/accounts/new');
    await screen.findByRole('heading', { name: 'Nueva cuenta' });
    type('Saldo ese día', 'mucho');
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Completa este campo.')).toBeTruthy();
    expect(screen.getByText('Escribe un valor válido, como 50.000.')).toBeTruthy();
    expect(api.actions()).toEqual([]);
  });
});

describe('Movimientos', () => {
  it('lists movements by day with category, account and signed amount', async () => {
    ledgerApi();
    renderApp('/transactions');
    expect(await screen.findByText('Mercado del mes')).toBeTruthy();
    expect(screen.getByText('Mercado, Bancolombia')).toBeTruthy();
    // Expenses show as negative amounts (the symbol depends on the browser's region).
    const row = screen.getByText('Mercado del mes').closest('a') as HTMLElement;
    expect(within(row).getByText(/^-.*310\.000/)).toBeTruthy();
  });

  it('records an expense with one idempotency key, even if the button is pressed twice', async () => {
    const api = ledgerApi({ 'POST /ledger/transactions': () => json(lunch, 201) });
    renderApp('/transactions/new');
    await screen.findByRole('heading', { name: 'Registrar movimiento' });
    type('Descripción', 'Mercado del mes');
    type('Valor', '310.000');
    const save = screen.getByRole('button', { name: 'Guardar gasto' });
    fireEvent.click(save);
    fireEvent.click(save);
    await screen.findByText('Mercado, Bancolombia');
    const posts = api.actions().filter((c) => c.path === '/ledger/transactions');
    expect(posts[0]?.body).toMatchObject({
      kind: 'expense',
      description: 'Mercado del mes',
      accountId: BANK,
      lines: [{ categoryId: MERCADO, amountMinor: '31000000' }],
    });
    const keys = new Set(posts.map((p) => p.headers?.['Idempotency-Key']));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('asks for what the other side received when currencies differ', async () => {
    const api = ledgerApi({ 'POST /ledger/transactions': () => json(lunch, 201) });
    renderApp('/transactions/new');
    await screen.findByRole('heading', { name: 'Registrar movimiento' });
    fireEvent.click(screen.getByRole('radio', { name: 'Transferencia' }));
    type('Descripción', 'Wise a Bancolombia');
    type('Desde', WISE);
    type('Hacia', BANK);
    type('Valor enviado', '1.000');
    type('Valor recibido', '4.010.000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar transferencia' }));
    await screen.findByText('Mercado del mes');
    expect(api.actions()[0]?.body).toMatchObject({
      kind: 'transfer',
      from: { accountId: WISE, amountMinor: '100000' },
      to: { accountId: BANK, amountMinor: '401000000' },
    });
  });

  it('edits with the version it loaded, and says so when someone else changed it first', async () => {
    const api = ledgerApi({
      [`PUT /ledger/transactions/${lunch.id}`]: () =>
        json({ error: { code: 'ledger.stale_version', message: '' } }, 409),
    });
    renderApp(`/transactions/${lunch.id}`);
    await screen.findByRole('heading', { name: 'Editar movimiento' });
    expect((screen.getByLabelText('Valor') as HTMLInputElement).value).toBe('310.000');
    type('Valor', '320.000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect((await screen.findByRole('alert')).textContent).toContain('cambió mientras lo editabas');
    expect(api.actions()[0]).toMatchObject({ method: 'PUT', body: { version: 1 } });
  });

  it('voids a movement', async () => {
    const api = ledgerApi({
      [`POST /ledger/transactions/${lunch.id}/void`]: () =>
        json({ ...lunch, status: 'void', entries: [] }),
    });
    renderApp(`/transactions/${lunch.id}`);
    await screen.findByRole('heading', { name: 'Editar movimiento' });
    fireEvent.click(screen.getByRole('button', { name: 'Anular movimiento' }));
    await screen.findByText('Mercado del mes');
    expect(api.actions()[0]).toMatchObject({
      method: 'POST',
      path: `/ledger/transactions/${lunch.id}/void`,
      body: { version: 1 },
    });
  });
});

const salary: TransactionView = {
  ...lunch,
  id: '01900000-0000-7000-8000-0000000000f2',
  occurredOn: '2026-03-14' as TransactionView['occurredOn'],
  kind: 'income',
  description: 'Salario quincenal',
  entries: [
    {
      ...(lunch.entries[0] as TransactionView['entries'][number]),
      id: 's1',
      amountMinor: '155000000',
    },
    {
      ...(lunch.entries[1] as TransactionView['entries'][number]),
      id: 's2',
      accountKind: 'income',
      amountMinor: '-155000000',
      categoryId: SALARIO,
    },
  ],
};

const toVisa: TransactionView = {
  ...lunch,
  id: '01900000-0000-7000-8000-0000000000f3',
  occurredOn: '2026-03-13' as TransactionView['occurredOn'],
  kind: 'transfer',
  description: 'Pago tarjeta',
  entries: [
    {
      ...(lunch.entries[0] as TransactionView['entries'][number]),
      id: 't1',
      amountMinor: '-20000000',
    },
    {
      ...(lunch.entries[0] as TransactionView['entries'][number]),
      id: 't2',
      accountId: VISA,
      accountKind: 'liability',
      amountMinor: '20000000',
    },
  ],
};

describe('Movimientos list', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-15T15:00:00Z'));
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CO']);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const listApi = (extra: Handlers = {}) =>
    ledgerApi({ 'GET /ledger/transactions': () => json([salary, toVisa, lunch]), ...extra });
  const listCalls = (api: ReturnType<typeof fakeApi>) =>
    api.calls.filter((c) => c.method === 'GET' && c.path.startsWith('/ledger/transactions'));

  it('shows this month by default and asks only for its dates', async () => {
    const api = listApi();
    renderApp('/transactions');
    await screen.findByText('Mercado del mes');
    expect(listCalls(api).at(-1)?.path).toMatch(/from=2026-03-01&to=2026-03-31/);
    expect(screen.getByRole('button', { name: 'Este mes' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText('Ayer, sábado 14')).toBeTruthy();
  });

  it('switches to last month', async () => {
    const api = listApi();
    renderApp('/transactions');
    await screen.findByText('Mercado del mes');
    fireEvent.click(screen.getByRole('button', { name: 'Mes pasado' }));
    await waitFor(() =>
      expect(listCalls(api).at(-1)?.path).toMatch(/from=2026-02-01&to=2026-02-28/),
    );
  });

  it('narrows by category and by search without asking the API again', async () => {
    const api = listApi();
    renderApp('/transactions');
    await screen.findByText('Mercado del mes');
    const before = listCalls(api).length;
    const callsBefore = api.calls.length;
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: SALARIO } });
    await waitFor(() => expect(screen.queryByText('Mercado del mes')).toBeNull());
    expect(screen.getByText('Salario quincenal')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: '' } });
    // Each change is its own step, as when a person makes them.
    expect(await screen.findByText('Mercado del mes')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar movimientos'), { target: { value: 'mercado' } });
    await waitFor(() => expect(screen.queryByText('Salario quincenal')).toBeNull());
    expect(screen.getByText('Mercado del mes')).toBeTruthy();
    expect(listCalls(api).length).toBe(before);
    // Not even the shell's session and preferences are asked again.
    expect(api.calls.length).toBe(callsBefore);
  });

  it('totals what is shown: count, money in, money out and the net', async () => {
    listApi();
    renderApp('/transactions');
    const totals = await screen.findByLabelText('Totales');
    // The transfer between own accounts is neither income nor spending.
    expect(totals.textContent?.replace(/\s+/g, ' ')).toBe(
      '3 movimientos Entró $ 1.550.000 Salió $ 310.000 Neto +$ 1.240.000',
    );
  });

  it('counts income and spending like the reports: an opening balance is neither, a refund lowers spending, a fee counts', async () => {
    const entry = lunch.entries[0] as TransactionView['entries'][number];
    const opening: TransactionView = {
      ...lunch,
      id: 'op',
      kind: 'adjustment',
      description: 'Saldo inicial',
      entries: [
        { ...entry, id: 'o1', amountMinor: '100000000' },
        { ...entry, id: 'o2', accountId: 'eq', accountKind: 'equity', amountMinor: '-100000000' },
      ],
    };
    const refund: TransactionView = {
      ...lunch,
      id: 'rf',
      description: 'Devolución',
      entries: [
        { ...entry, id: 'r1', amountMinor: '5000000' },
        {
          ...entry,
          id: 'r2',
          accountId: 'x',
          accountKind: 'expense',
          amountMinor: '-5000000',
          categoryId: MERCADO,
        },
      ],
    };
    const withFee: TransactionView = {
      ...toVisa,
      id: 'fee',
      description: 'Pago con comisión',
      entries: [
        { ...entry, id: 'f1', amountMinor: '-20500000' },
        { ...entry, id: 'f2', accountId: VISA, accountKind: 'liability', amountMinor: '20000000' },
        {
          ...entry,
          id: 'f3',
          accountId: 'x',
          accountKind: 'expense',
          amountMinor: '500000',
          categoryId: MERCADO,
        },
      ],
    };
    listApi({ 'GET /ledger/transactions': () => json([salary, lunch, opening, refund, withFee]) });
    renderApp('/transactions');
    const totals = await screen.findByLabelText('Totales');
    // In 1.550.000; out 310.000 − 50.000 + 5.000.
    expect(totals.textContent?.replace(/\s+/g, ' ')).toBe(
      '5 movimientos Entró $ 1.550.000 Salió $ 265.000 Neto +$ 1.285.000',
    );
  });

  it('totals each currency on its own line', async () => {
    const entry = lunch.entries[0] as TransactionView['entries'][number];
    const dollars: TransactionView = {
      ...lunch,
      id: 'usd',
      description: 'Suscripción',
      entries: [
        { ...entry, id: 'u1', accountId: WISE, currency: 'USD', amountMinor: '-2000' },
        {
          ...entry,
          id: 'u2',
          accountId: 'x',
          accountKind: 'expense',
          currency: 'USD',
          amountMinor: '2000',
          categoryId: MERCADO,
        },
      ],
    };
    listApi({ 'GET /ledger/transactions': () => json([lunch, dollars]) });
    renderApp('/transactions');
    const totals = (await screen.findByLabelText('Totales')).textContent?.replace(/\s+/g, ' ');
    expect(totals).toContain('Salió $ 310.000');
    expect(totals).toContain('Salió US$ 20,00');
  });

  it('falls back to this month for an impossible date instead of breaking', async () => {
    listApi();
    renderApp('/transactions?period=custom&from=2026-02-30&to=2026-03-10');
    expect(await screen.findByText('Mercado del mes')).toBeTruthy();
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('2026-03-01');
  });

  it('keeps the search box in step with the address', async () => {
    listApi();
    const router = renderApp('/transactions?q=mercado');
    const box = (await screen.findByLabelText('Buscar movimientos')) as HTMLInputElement;
    expect(box.value).toBe('mercado');
    await act(() => router.navigate('/transactions'));
    await waitFor(() => expect(box.value).toBe(''));
    expect(screen.getByText('Salario quincenal')).toBeTruthy();
  });

  it('puts what waits for confirmation first', async () => {
    listApi({
      'GET /recurring/pending': () =>
        json([
          {
            ruleId: 'r1',
            dueOn: '2026-03-15',
            status: 'pending',
            transactionId: null,
            error: null,
            description: 'Plan celular',
            amountMinor: '6590000',
            currency: 'COP',
          },
        ]),
    });
    renderApp('/transactions');
    const group = await screen.findByRole('region', { name: 'Por confirmar' });
    expect(within(group).getByText('Plan celular')).toBeTruthy();
    expect(
      within(group)
        .getByRole('link', { name: /Confirmar/ })
        .getAttribute('href'),
    ).toBe('/transactions/recurring');
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(regions[0]).toBe('Por confirmar');
  });

  it('shows a transfer without a sign, since it is neither income nor spending', async () => {
    listApi();
    renderApp('/transactions');
    const row = (await screen.findByText('Pago tarjeta')).closest('a') as HTMLElement;
    expect(row.textContent).toMatch(/\$\s200\.000$/);
    expect(row.textContent).not.toMatch(/[+-]\$/);
  });
});

describe('Registrar movimiento', () => {
  const TRANSPORTE = '01900000-0000-7000-8000-0000000000c3';
  const formApi = () =>
    ledgerApi({
      'GET /categories': () =>
        json([
          ...CATEGORIES,
          { id: TRANSPORTE, kind: 'expense', parentId: null, name: 'Transporte', archived: false },
        ]),
    });

  it('offers the most used categories as quick picks that fill the category', async () => {
    formApi();
    renderApp('/transactions/new');
    await screen.findByRole('heading', { name: 'Registrar movimiento' });
    const picks = within(screen.getByRole('group', { name: 'Más usadas' }));
    // Mercado was used before, so it comes first.
    expect(picks.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Mercado',
      'Transporte',
    ]);
    fireEvent.click(picks.getByRole('button', { name: 'Transporte' }));
    expect((screen.getByLabelText('Categoría') as HTMLSelectElement).value).toBe(TRANSPORTE);
    expect(picks.getByRole('button', { name: 'Transporte' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(picks.getByRole('button', { name: 'Mercado' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('starts on the most used category, not the first one in the list', async () => {
    ledgerApi({
      'GET /categories': () =>
        json([
          { id: 'ajustes', kind: 'expense', parentId: null, name: 'Ajustes', archived: false },
          ...CATEGORIES,
        ]),
    });
    renderApp('/transactions/new');
    await screen.findByRole('heading', { name: 'Registrar movimiento' });
    expect((screen.getByLabelText('Categoría') as HTMLSelectElement).value).toBe(MERCADO);
  });

  it('names the save button after what is being recorded', async () => {
    formApi();
    renderApp('/transactions/new');
    expect(await screen.findByRole('button', { name: 'Guardar gasto' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Ingreso' }));
    expect(screen.getByRole('button', { name: 'Guardar ingreso' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Transferencia' }));
    expect(screen.getByRole('button', { name: 'Guardar transferencia' })).toBeTruthy();
  });

  it('makes Repetir a switch that shows how often', async () => {
    formApi();
    renderApp('/transactions/new');
    const repeat = await screen.findByRole('switch', { name: /Repetir este movimiento/ });
    expect(screen.queryByText('Cada cuánto')).toBeNull();
    fireEvent.click(repeat);
    expect(screen.getByText('Cada cuánto')).toBeTruthy();
  });

  it('can be closed back to Movimientos', async () => {
    formApi();
    renderApp('/transactions/new');
    const close = await screen.findByRole('link', { name: 'Cerrar' });
    expect(close.getAttribute('href')).toBe('/transactions');
  });
});

describe('when Movimientos reloads', () => {
  const url = (search: string) => new URL(`http://localhost/transactions${search}`);
  const args = (from: string, to: string, extra = {}) =>
    ({
      currentUrl: url(from),
      nextUrl: url(to),
      defaultShouldRevalidate: true,
      ...extra,
    }) as Parameters<typeof transactionsShouldRevalidate>[0];

  it('skips the loader only when the search or the category changed', () => {
    expect(transactionsShouldRevalidate(args('', '?q=mercado'))).toBe(false);
    expect(transactionsShouldRevalidate(args('?q=mer', '?q=mercado&cat=x'))).toBe(false);
  });

  it('reloads for a new period or account, a saved form, or an explicit refresh', () => {
    expect(transactionsShouldRevalidate(args('', '?period=last'))).toBe(true);
    expect(transactionsShouldRevalidate(args('?q=a', '?q=a&account=b'))).toBe(true);
    // Same address: the shell's refresh after recording recurring movements.
    expect(transactionsShouldRevalidate(args('?q=a', '?q=a'))).toBe(true);
    expect(transactionsShouldRevalidate(args('', '?q=a', { formMethod: 'POST' }))).toBe(true);
  });
});
