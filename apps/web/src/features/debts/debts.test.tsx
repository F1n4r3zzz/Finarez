import type {
  AccountView,
  DebtView,
  PaymentView,
  ProposalView,
  ScheduleView,
} from '@finanz/contracts';
import type { LocalDate } from '@finanz/kernel';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi, type Handlers, json, renderApp, signedIn } from '../../test/fake-api';

const BANK = '01900000-0000-7000-8000-00000000000a';
const WISE = '01900000-0000-7000-8000-00000000000c';
const CAR = '01900000-0000-7000-8000-0000000000d1';
const PAYMENT = '01900000-0000-7000-8000-0000000000f2';
const day = (d: string) => d as LocalDate;

const account = (
  id: string,
  name: string,
  subtype: AccountView['subtype'],
  currency: AccountView['currency'],
): AccountView => ({
  id,
  name,
  kind: subtype === 'loan' ? 'liability' : 'asset',
  subtype,
  currency,
  institution: null,
  openedOn: day('2025-09-30'),
  archived: false,
  balanceMinor: '0',
});

const carLoan: DebtView = {
  id: CAR,
  accountId: '01900000-0000-7000-8000-0000000000d2',
  name: 'Crédito vehículo',
  type: 'loan',
  currency: 'COP',
  outstandingMinor: '3844157800',
  rate: '0.012',
  ratePeriod: 'monthly',
  originalPrincipalMinor: '4800000000',
  termMonths: 48,
  installmentMinor: '132132200',
  startOn: day('2024-10-28'),
  dueDay: 28,
  statementDay: null,
  creditLimitMinor: null,
  interestCategoryId: '01900000-0000-7000-8000-0000000000c3',
  nextDueOn: day('2026-10-28'),
  archived: false,
};

const october: PaymentView = {
  transactionId: PAYMENT,
  version: 1,
  status: 'posted',
  paidOn: day('2026-09-28'),
  description: 'Pago Crédito vehículo',
  fromAccountId: BANK,
  amountMinor: '132132200',
  principalMinor: '86002300',
  interestMinor: '46129900',
  feesMinor: '0',
};

const schedule = (rows: number): ScheduleView => ({
  neverEnds: false,
  rows: Array.from({ length: rows }, (_, i) => ({
    dueOn: day(
      `${2026 + Math.floor((9 + i) / 12)}-${String(((9 + i) % 12) + 1).padStart(2, '0')}-28`,
    ),
    installmentMinor: '132132200',
    interestMinor: '46129900',
    principalMinor: '86002300',
    balanceAfterMinor: String(3844157800 - 86002300 * (i + 1)),
  })),
});

const proposal: ProposalView = {
  outstandingMinor: '3844157800',
  interestMinor: '46129900',
  principalMinor: '86002300',
};

function debtsApi(extra: Handlers = {}) {
  return fakeApi({
    ...signedIn,
    'GET /debts': () => json([carLoan]),
    'GET /ledger/accounts': () =>
      json([account(BANK, 'Bancolombia', 'bank', 'COP'), account(WISE, 'Wise', 'bank', 'USD')]),
    [`GET /debts/${CAR}/payments`]: () => json([october]),
    [`GET /debts/${CAR}/schedule`]: () => json(schedule(30)),
    [`GET /debts/${CAR}/proposal`]: () => json(proposal),
    ...extra,
  });
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Deudas', () => {
  it('lists each debt with what is owed, how much is paid off and the next payment', async () => {
    debtsApi();
    renderApp('/debts');
    const card = (await screen.findByText('Crédito vehículo')).closest('a');
    if (!card) throw new Error('no card');
    expect(card.getAttribute('href')).toBe(`/debts/${CAR}`);
    expect(within(card).getByText(/38\.441\.578/)).toBeTruthy();
    expect(within(card).getByText(/Has pagado el 20\s?% de .*48\.000\.000/)).toBeTruthy();
    expect(within(card).getByText(/Próximo pago: .*28 de octubre/)).toBeTruthy();
    expect(screen.getByText('Debes en total')).toBeTruthy();
  });

  it('invites you to add the first one', async () => {
    debtsApi({ 'GET /debts': () => json([]) });
    renderApp('/debts');
    expect(await screen.findByText('No tienes deudas registradas')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Agregar deuda' }).getAttribute('href')).toBe(
      '/debts/new',
    );
  });

  it('adds a loan with its rate as typed (1,2 % a month) and opens it', async () => {
    const api = debtsApi({ 'POST /debts': () => json(carLoan, 201) });
    const router = renderApp('/debts/new');
    await screen.findByRole('heading', { name: 'Nueva deuda' });
    type('Nombre', 'Crédito vehículo');
    type('Cuánto debes ese día', '38.441.578');
    type('Tasa de interés (%)', '1,2');
    type('Cuota mensual', '1.321.322');
    type('Día de pago', '28');
    type('Plazo total (meses)', '48');
    type('Monto original (opcional)', '48.000.000');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar deuda' }));
    await screen.findByRole('heading', { name: 'Crédito vehículo' });
    expect(router.state.location.pathname).toBe(`/debts/${CAR}`);
    const post = api.actions()[0];
    expect(post?.headers?.['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(post).toMatchObject({
      path: '/debts',
      body: {
        name: 'Crédito vehículo',
        type: 'loan',
        currency: 'COP',
        outstandingMinor: '3844157800',
        rate: '0.012',
        ratePeriod: 'monthly',
        installmentMinor: '132132200',
        dueDay: 28,
        termMonths: 48,
        originalPrincipalMinor: '4800000000',
      },
    });
  });

  it('a card asks for its limit and statement day, and its rate defaults to effective annual', async () => {
    const api = debtsApi({ 'POST /debts': () => json(carLoan, 201) });
    renderApp('/debts/new');
    await screen.findByRole('heading', { name: 'Nueva deuda' });
    fireEvent.click(screen.getByRole('radio', { name: 'Tarjeta de crédito' }));
    type('Nombre', 'Visa');
    type('Cuánto debes ese día', '0');
    type('Cupo', '8.000.000');
    type('Tasa de interés (%)', '26,8242');
    type('Día de corte', '15');
    expect(screen.queryByLabelText('Cuota mensual')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar deuda' }));
    await screen.findByRole('heading', { name: 'Crédito vehículo' });
    expect(api.actions()[0]?.body).toMatchObject({
      type: 'credit_card',
      outstandingMinor: '0',
      creditLimitMinor: '800000000',
      rate: '0.268242',
      ratePeriod: 'annual',
      statementDay: 15,
    });
  });

  it('says which field to fix', async () => {
    const api = debtsApi();
    renderApp('/debts/new');
    await screen.findByRole('heading', { name: 'Nueva deuda' });
    type('Tasa de interés (%)', 'alta');
    type('Día de pago', '32');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar deuda' }));
    expect(
      await screen.findByText('Escribe la tasa como un número, por ejemplo 1,8.'),
    ).toBeTruthy();
    expect(screen.getByText('Escribe un día del mes, de 1 a 31.')).toBeTruthy();
    expect(screen.getAllByText('Completa este campo.')).toHaveLength(2); // name and owed
    expect(api.actions()).toEqual([]);
  });
});

describe('A debt', () => {
  it('shows what is owed, its terms, the payments made and what is left', async () => {
    debtsApi();
    renderApp(`/debts/${CAR}`);
    await screen.findByRole('heading', { name: 'Crédito vehículo' });
    const terms = screen.getByRole('region', { name: 'Condiciones' });
    expect(within(terms).getByText('1,2 % mensual')).toBeTruthy();
    expect(within(terms).getByText('48 meses')).toBeTruthy();
    const history = screen.getByRole('region', { name: 'Pagos' });
    expect(
      within(history).getByText(/860\.023.* a la deuda, .*461\.299.* de intereses/),
    ).toBeTruthy();
    const left = screen.getByRole('region', { name: 'Lo que falta' });
    expect(within(left).getByText(/Te faltan 30 cuotas/)).toBeTruthy();
    expect(within(left).getAllByRole('row')).toHaveLength(13); // header + 12
    fireEvent.click(within(left).getByRole('button', { name: 'Ver las 30 cuotas' }));
    expect(within(left).getAllByRole('row')).toHaveLength(31);
  });

  it('proposes the interest and principal of a payment and records it once', async () => {
    const api = debtsApi({ [`POST /debts/${CAR}/payments`]: () => json(october, 201) });
    renderApp(`/debts/${CAR}`);
    await screen.findByRole('heading', { name: 'Crédito vehículo' });
    // Only accounts in the debt's currency can pay it.
    expect(screen.queryByRole('option', { name: 'Wise' })).toBeNull();
    type('Valor pagado', '1.321.322');
    expect(
      await screen.findByText(/461\.299.* son intereses y .*860\.023.* reducen tu deuda/),
    ).toBeTruthy();
    const pay = screen.getByRole('button', { name: 'Registrar pago' });
    fireEvent.click(pay);
    fireEvent.click(pay);
    expect(await screen.findByText('Pago registrado.')).toBeTruthy();
    const posts = api.actions().filter((c) => c.path === `/debts/${CAR}/payments`);
    expect(new Set(posts.map((p) => p.headers?.['Idempotency-Key'])).size).toBe(1);
    expect(posts[0]?.body).toEqual({
      fromAccountId: BANK,
      paidOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      amountMinor: '132132200',
    });
    const proposals = api.calls.filter((c) => c.path.startsWith(`/debts/${CAR}/proposal`));
    expect(proposals.at(-1)?.path).toContain('amountMinor=132132200');
    await waitFor(() =>
      expect((screen.getByLabelText('Valor pagado') as HTMLInputElement).value).toBe(''),
    );
  });

  it('uses the split from the bank statement when you give one', async () => {
    const api = debtsApi({ [`POST /debts/${CAR}/payments`]: () => json(october, 201) });
    renderApp(`/debts/${CAR}`);
    await screen.findByRole('heading', { name: 'Crédito vehículo' });
    type('Valor pagado', '1.400.000');
    fireEvent.click(screen.getByRole('checkbox', { name: 'El banco me dio otro desglose' }));
    type('Intereses', '461.299');
    type('Comisiones y seguros', '78.678');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    await screen.findByText('Pago registrado.');
    expect(api.actions()[0]?.body).toMatchObject({
      amountMinor: '140000000',
      interestMinor: '46129900',
      feesMinor: '7867800',
    });
  });

  it('explains why the API refused a payment', async () => {
    debtsApi({
      [`POST /debts/${CAR}/payments`]: () =>
        json({ error: { code: 'debt.overpayment', message: '' } }, 422),
    });
    renderApp(`/debts/${CAR}`);
    await screen.findByRole('heading', { name: 'Crédito vehículo' });
    type('Valor pagado', '90.000.000');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ese pago es mayor que lo que debes.',
    );
  });

  it('voids a payment after asking', async () => {
    const api = debtsApi({
      [`POST /debts/${CAR}/payments/${PAYMENT}/void`]: () => json({ ok: true }),
    });
    renderApp(`/debts/${CAR}`);
    const history = await screen.findByRole('region', { name: 'Pagos' });
    fireEvent.click(within(history).getByRole('button', { name: 'Anular pago' }));
    expect(within(history).getByText(/Volverá a contar como deuda/)).toBeTruthy();
    fireEvent.click(within(history).getByRole('button', { name: 'Anular pago' }));
    await waitFor(() => expect(api.actions()).toHaveLength(1));
    expect(api.actions()).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: `/debts/${CAR}/payments/${PAYMENT}/void`,
        body: { version: 1 },
      }),
    ]);
  });

  it('asks for an account in the same currency before taking payments', async () => {
    debtsApi({
      'GET /ledger/accounts': () => json([account(WISE, 'Wise', 'bank', 'USD')]),
    });
    renderApp(`/debts/${CAR}`);
    expect(
      await screen.findByText(/necesitas una cuenta de banco, efectivo o billetera en COP/),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).toBeNull();
  });

  it('warns when the last installment would be much larger than the rest', async () => {
    const rows = schedule(3).rows;
    const last = { ...rows[2], installmentMinor: '1300000000' } as ScheduleView['rows'][number];
    debtsApi({
      [`GET /debts/${CAR}/schedule`]: () =>
        json({ neverEnds: false, rows: [...rows.slice(0, 2), last] }),
    });
    renderApp(`/debts/${CAR}`);
    const left = await screen.findByRole('region', { name: 'Lo que falta' });
    expect(within(left).getByText(/la última cuota sería de .*13\.000\.000/)).toBeTruthy();
  });

  it('edits the terms, shown as they were typed', async () => {
    const api = debtsApi({ [`PATCH /debts/${CAR}`]: () => json(carLoan) });
    const router = renderApp(`/debts/${CAR}`);
    const terms = await screen.findByRole('region', { name: 'Condiciones' });
    fireEvent.click(within(terms).getByRole('link', { name: 'Editar' }));
    await screen.findByRole('heading', { name: 'Editar condiciones' });
    expect((screen.getByLabelText('Tasa de interés (%)') as HTMLInputElement).value).toBe('1,2');
    expect((screen.getByLabelText('Cuota mensual') as HTMLInputElement).value).toBe('1.321.322');
    type('Tasa de interés (%)', '1,05');
    type('Plazo total (meses)', '');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar condiciones' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/debts/${CAR}`));
    expect(api.actions()[0]).toEqual({
      method: 'PATCH',
      path: `/debts/${CAR}`,
      body: {
        rate: '0.0105',
        ratePeriod: 'monthly',
        dueDay: 28,
        installmentMinor: '132132200',
        termMonths: null,
        startOn: '2024-10-28',
        originalPrincipalMinor: '4800000000',
      },
    });
  });

  it('a debt that does not exist shows the not-found page', async () => {
    debtsApi();
    renderApp('/debts/01900000-0000-7000-8000-0000000000ff');
    expect(await screen.findByRole('heading', { name: 'Esta página no existe' })).toBeTruthy();
  });
});
