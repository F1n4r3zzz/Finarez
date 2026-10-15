import type { AccountView, Category, TransactionView } from '@finanz/contracts';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi, type Handlers, json, renderApp, signedIn } from '../../test/fake-api';

const BANK = '01900000-0000-7000-8000-00000000000a';
const VISA = '01900000-0000-7000-8000-00000000000b';
const WISE = '01900000-0000-7000-8000-00000000000c';
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
  it('lists what you have and what you owe, debts as positive amounts, with totals per currency', async () => {
    ledgerApi();
    renderApp('/accounts');
    const have = await screen.findByRole('region', { name: 'Lo que tienes' });
    expect(within(have).getByText('Bancolombia')).toBeTruthy();
    expect(within(have).getByText('Total en USD')).toBeTruthy();
    const owe = screen.getByRole('region', { name: 'Lo que debes' });
    expect(within(owe).getAllByText(/2\.340\.000/)).toHaveLength(2);
    expect(owe.textContent).not.toContain('-');
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
    expect(screen.getByText(/^-.*310\.000/)).toBeTruthy();
  });

  it('records an expense with one idempotency key, even if the button is pressed twice', async () => {
    const api = ledgerApi({ 'POST /ledger/transactions': () => json(lunch, 201) });
    renderApp('/transactions/new');
    await screen.findByRole('heading', { name: 'Nuevo movimiento' });
    type('Descripción', 'Mercado del mes');
    type('Valor', '310.000');
    const save = screen.getByRole('button', { name: 'Guardar' });
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
    await screen.findByRole('heading', { name: 'Nuevo movimiento' });
    fireEvent.click(screen.getByRole('radio', { name: 'Transferencia' }));
    type('Descripción', 'Wise a Bancolombia');
    type('Desde', WISE);
    type('Hacia', BANK);
    type('Valor enviado', '1.000');
    type('Valor recibido', '4.010.000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
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
