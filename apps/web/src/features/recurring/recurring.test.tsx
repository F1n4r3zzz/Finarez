import type { AccountView, Category, OccurrenceView, RuleView } from '@finanz/contracts';
import type { LocalDate } from '@finanz/kernel';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, type Handlers, json, renderApp, signedIn } from '../../test/fake-api';

const day = (d: string) => d as LocalDate;
const BANK = '01900000-0000-7000-8000-00000000000a';
const NEQUI = '01900000-0000-7000-8000-00000000000b';
const CELULAR = '01900000-0000-7000-8000-0000000000c1';
const SALARIO = '01900000-0000-7000-8000-0000000000c2';
const PHONE = '01900000-0000-7000-8000-0000000000d1';
const SALARY = '01900000-0000-7000-8000-0000000000d2';
const POCKET = '01900000-0000-7000-8000-0000000000d3';
const TX = '01900000-0000-7000-8000-0000000000f1';

const account = (id: string, name: string, subtype: AccountView['subtype']): AccountView => ({
  id,
  name,
  kind: 'asset',
  subtype,
  currency: 'COP',
  institution: null,
  openedOn: day('2025-09-30'),
  archived: false,
  balanceMinor: '500000000',
});
const ACCOUNTS = [account(BANK, 'Bancolombia', 'bank'), account(NEQUI, 'Nequi', 'wallet')];
const CATEGORIES: Category[] = [
  { id: CELULAR, kind: 'expense', parentId: null, name: 'Celular', archived: false },
  { id: SALARIO, kind: 'income', parentId: null, name: 'Salario', archived: false },
];

const rule = (over: Partial<RuleView>): RuleView => ({
  id: PHONE,
  template: {
    kind: 'expense',
    description: 'Plan celular',
    accountId: BANK,
    lines: [{ categoryId: CELULAR, amountMinor: '6590000' }],
  },
  frequency: 'monthly',
  anchorOn: day('2026-09-20'),
  secondDay: null,
  nextDueOn: day('2026-10-20'),
  endsOn: null,
  confirm: true,
  ended: false,
  pending: 1,
  amountMinor: '6590000',
  currency: 'COP',
  ...over,
});

const RULES: RuleView[] = [
  rule({}),
  rule({
    id: SALARY,
    template: {
      kind: 'income',
      description: 'Salario',
      accountId: BANK,
      lines: [{ categoryId: SALARIO, amountMinor: '310000000' }],
    },
    frequency: 'twice_monthly',
    anchorOn: day('2026-10-15'),
    secondDay: 30,
    nextDueOn: day('2026-10-30'),
    confirm: false,
    pending: 0,
    amountMinor: '310000000',
  }),
  rule({
    id: POCKET,
    template: {
      kind: 'transfer',
      description: 'Para gastos del mes',
      from: { accountId: BANK, amountMinor: '80000000' },
      to: { accountId: NEQUI, amountMinor: '80000000' },
    },
    anchorOn: day('2026-01-01'),
    nextDueOn: day('2026-11-01'),
    confirm: false,
    ended: true,
    pending: 0,
    amountMinor: '80000000',
  }),
];

const waiting: OccurrenceView = {
  ruleId: PHONE,
  dueOn: day('2026-09-20'),
  status: 'pending',
  transactionId: null,
  error: null,
  description: 'Plan celular',
  amountMinor: '6590000',
  currency: 'COP',
};

function recurringApi(extra: Handlers = {}) {
  return fakeApi({
    ...signedIn,
    'GET /ledger/accounts': () => json(ACCOUNTS),
    'GET /categories': () => json(CATEGORIES),
    'GET /recurring/rules': () => json(RULES),
    'GET /recurring/pending': () => json([waiting]),
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

describe('Repetir, in a new movement', () => {
  it('creates a rule from the movement and opens it', async () => {
    const api = recurringApi({
      'POST /recurring/rules': () => json(RULES[0], 201),
      [`GET /recurring/rules/${PHONE}`]: () => json(RULES[0]),
      [`GET /recurring/rules/${PHONE}/occurrences`]: () => json([]),
    });
    const router = renderApp('/transactions/new');
    await screen.findByRole('heading', { name: 'Nuevo movimiento' });
    expect(screen.queryByText('Cada cuánto')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Repetir este movimiento/));
    type('Descripción', 'Plan celular');
    type('Valor', '65.900');
    fireEvent.click(screen.getByLabelText('Preguntarme'));
    expect(screen.getByText('Este movimiento se guarda ahora.')).toBeTruthy();
    expect(
      screen.getByText(
        'Próximas veces: 15 de noviembre de 2026, 15 de diciembre de 2026 y 15 de enero de 2027.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('heading', { level: 1, name: 'Plan celular' });
    expect(router.state.location.pathname).toBe(`/transactions/recurring/${PHONE}`);
    const [created] = api.actions();
    expect(created?.headers?.['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(created).toMatchObject({
      method: 'POST',
      path: '/recurring/rules',
      body: {
        draft: {
          kind: 'expense',
          occurredOn: '2026-10-15',
          description: 'Plan celular',
          accountId: BANK,
          lines: [{ categoryId: CELULAR, amountMinor: '6590000' }],
        },
        frequency: 'monthly',
        secondDay: null,
        endsOn: null,
        confirm: true,
      },
    });
  });

  it('twice a month proposes the other payday, and a final date cuts the list short', async () => {
    const api = recurringApi();
    renderApp('/transactions/new?repeat=1');
    await screen.findByRole('heading', { name: 'Nuevo movimiento' });
    fireEvent.click(screen.getByLabelText('Quincenal'));
    expect((screen.getByLabelText('Segundo día del mes') as HTMLSelectElement).value).toBe('30');
    expect(screen.getByText(/30 de octubre de 2026, 15 de noviembre de 2026 y 30 de/)).toBeTruthy();
    type('Hasta (opcional)', '2026-11-20');
    expect(
      screen.getByText('Próximas veces: 30 de octubre de 2026 y 15 de noviembre de 2026.'),
    ).toBeTruthy();
    type('Hasta (opcional)', '2026-10-01');
    type('Descripción', 'Salario');
    type('Valor', '3.100.000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('Debe ser igual o posterior a la fecha del movimiento.'),
    ).toBeTruthy();
    expect(api.actions()).toHaveLength(0);
  });

  it('is not offered when editing a movement', async () => {
    recurringApi({
      [`GET /ledger/transactions/${TX}`]: () =>
        json({
          id: TX,
          occurredOn: '2026-10-01',
          kind: 'expense',
          status: 'posted',
          managedBy: null,
          description: 'Plan celular',
          payee: null,
          notes: null,
          version: 1,
          entries: [
            {
              id: 'e1',
              accountId: BANK,
              accountKind: 'asset',
              currency: 'COP',
              amountMinor: '-6590000',
              categoryId: null,
              memo: null,
              reconciled: false,
            },
            {
              id: 'e2',
              accountId: 'x',
              accountKind: 'expense',
              currency: 'COP',
              amountMinor: '6590000',
              categoryId: CELULAR,
              memo: null,
              reconciled: false,
            },
          ],
        }),
    });
    renderApp(`/transactions/${TX}`);
    await screen.findByRole('heading', { name: 'Editar movimiento' });
    expect(screen.queryByLabelText(/Repetir este movimiento/)).toBeNull();
  });
});

describe('Recurrentes', () => {
  it('lists what waits, the active rules and the ended ones', async () => {
    recurringApi();
    renderApp('/transactions/recurring');
    const pending = await screen.findByRole('region', { name: 'Por confirmar' });
    expect(within(pending).getByText('Plan celular')).toBeTruthy();
    expect(within(pending).getByText(/domingo, 20 de septiembre/i)).toBeTruthy();
    const active = screen.getByRole('region', { name: 'Activos' });
    expect(within(active).getByText('Cada quincena, los días 15 y 30')).toBeTruthy();
    expect(
      within(active).getByText(/Próxima: 20 oct, te pregunta antes, Bancolombia/),
    ).toBeTruthy();
    const ended = screen.getByRole('region', { name: 'Terminados' });
    expect(within(ended).getByText('Para gastos del mes')).toBeTruthy();
    expect(within(ended).getByText(/Bancolombia → Nequi/)).toBeTruthy();
  });

  it('records a waiting one with another amount and date, or skips it', async () => {
    const api = recurringApi({
      [`POST /recurring/rules/${PHONE}/occurrences/2026-09-20/confirm`]: () => json({ ok: true }),
      [`POST /recurring/rules/${PHONE}/occurrences/2026-09-20/skip`]: () => json({ ok: true }),
    });
    renderApp('/transactions/recurring');
    const pending = await screen.findByRole('region', { name: 'Por confirmar' });
    fireEvent.click(within(pending).getByRole('button', { name: 'Ajustar' }));
    expect((screen.getByLabelText('Valor (COP)') as HTMLInputElement).value).toBe('65.900');
    type('Valor (COP)', '71.200');
    type('Fecha', '2026-09-22');
    fireEvent.click(within(pending).getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(api.actions()).toHaveLength(1));
    expect(api.actions()[0]).toMatchObject({
      method: 'POST',
      path: `/recurring/rules/${PHONE}/occurrences/2026-09-20/confirm`,
      body: { amountMinor: '7120000', occurredOn: '2026-09-22' },
    });
    fireEvent.click(within(pending).getByRole('button', { name: 'Omitir' }));
    await waitFor(() => expect(api.actions()).toHaveLength(2));
    expect(api.actions()[1]?.path).toBe(`/recurring/rules/${PHONE}/occurrences/2026-09-20/skip`);
  });

  it('records it as usual without sending anything to change', async () => {
    const api = recurringApi({
      [`POST /recurring/rules/${PHONE}/occurrences/2026-09-20/confirm`]: () => json({ ok: true }),
    });
    renderApp('/transactions/recurring');
    const pending = await screen.findByRole('region', { name: 'Por confirmar' });
    fireEvent.click(within(pending).getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(api.actions()).toHaveLength(1));
    expect(api.actions()[0]?.body).toEqual({});
  });

  it('says why an automatic one could not be recorded', async () => {
    recurringApi({
      'GET /recurring/pending': () => json([{ ...waiting, error: 'ledger.account_archived' }]),
    });
    renderApp('/transactions/recurring');
    expect(
      await screen.findByText(
        'No se pudo registrar solo. Esa cuenta está archivada. Elige otra o desarchívala.',
      ),
    ).toBeTruthy();
  });

  it('invites to repeat a movement when there are none', async () => {
    recurringApi({
      'GET /recurring/rules': () => json([]),
      'GET /recurring/pending': () => json([]),
    });
    renderApp('/transactions/recurring');
    await screen.findByRole('heading', { name: 'Nada se repite todavía' });
    expect(screen.getByRole('link', { name: 'Nuevo recurrente' }).getAttribute('href')).toBe(
      '/transactions/new?repeat=1',
    );
  });

  it('is linked from Movimientos', async () => {
    recurringApi();
    renderApp('/transactions');
    const link = await screen.findByRole('link', { name: 'Recurrentes' });
    expect(link.getAttribute('href')).toBe('/transactions/recurring');
  });
});

describe('A recurring rule', () => {
  const salary = RULES[1] as RuleView;
  const ruleApi = (extra: Handlers = {}) =>
    recurringApi({
      [`GET /recurring/rules/${SALARY}`]: () => json(salary),
      [`GET /recurring/rules/${SALARY}/occurrences`]: () =>
        json([
          {
            ...waiting,
            ruleId: SALARY,
            dueOn: '2026-10-15',
            status: 'posted',
            transactionId: TX,
            description: 'Salario',
          },
        ]),
      ...extra,
    });

  it('shows its schedule and history, skips the next date and ends after a confirmation', async () => {
    const api = ruleApi({
      [`POST /recurring/rules/${SALARY}/skip-next`]: () => json(salary),
      [`POST /recurring/rules/${SALARY}/end`]: () => json({ ...salary, ended: true }),
    });
    renderApp(`/transactions/recurring/${SALARY}`);
    await screen.findByRole('heading', { level: 1, name: 'Salario' });
    expect(screen.getByText('Cada quincena, los días 15 y 30')).toBeTruthy();
    expect(screen.getByText('Ingreso, Salario, Bancolombia')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Registrado' }).getAttribute('href')).toBe(
      `/transactions/${TX}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Saltar el 30 oct 2026' }));
    await waitFor(() => expect(api.actions()).toHaveLength(1));
    expect(api.actions()[0]?.path).toBe(`/recurring/rules/${SALARY}/skip-next`);
    fireEvent.click(screen.getByRole('button', { name: 'Terminar recurrente' }));
    expect(api.actions()).toHaveLength(1);
    expect(screen.getByText(/¿Terminar este recurrente\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Terminar recurrente' }));
    await waitFor(() => expect(api.actions()).toHaveLength(2));
    expect(api.actions()[1]?.path).toBe(`/recurring/rules/${SALARY}/end`);
  });

  it('edits only what changed; the other payday is the one the next date is not on', async () => {
    const api = ruleApi({
      [`PATCH /recurring/rules/${SALARY}`]: () => json(salary),
    });
    const router = renderApp(`/transactions/recurring/${SALARY}/edit`);
    await screen.findByRole('heading', { name: 'Editar recurrente' });
    expect((screen.getByLabelText('Segundo día del mes') as HTMLSelectElement).value).toBe('15');
    type('Valor', '3.250.000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByRole('heading', { level: 1, name: 'Salario' });
    expect(router.state.location.pathname).toBe(`/transactions/recurring/${SALARY}`);
    expect(api.actions()).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        path: `/recurring/rules/${SALARY}`,
        body: { amountMinor: '325000000' },
      }),
    ]);
  });

  it('sends the whole schedule when it changes', async () => {
    const api = ruleApi({
      [`PATCH /recurring/rules/${SALARY}`]: () => json(salary),
    });
    renderApp(`/transactions/recurring/${SALARY}/edit`);
    await screen.findByRole('heading', { name: 'Editar recurrente' });
    fireEvent.click(screen.getByLabelText('Mensual'));
    type('Próxima vez', '2026-11-05');
    fireEvent.click(screen.getByLabelText('Preguntarme'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.actions()).toHaveLength(1));
    expect(api.actions()[0]?.body).toEqual({
      frequency: 'monthly',
      secondDay: null,
      nextDueOn: '2026-11-05',
      confirm: true,
    });
  });
});

describe('Inicio', () => {
  it('lists what waits for confirmation under Próximos, with a way to confirm it', async () => {
    recurringApi();
    renderApp('/');
    const upcoming = within(await screen.findByRole('region', { name: 'Próximos' }));
    expect(upcoming.getByText('Plan celular')).toBeTruthy();
    expect(upcoming.getByRole('link', { name: 'Confirmar' }).getAttribute('href')).toBe(
      '/transactions/recurring',
    );
  });

  it('runs what came due once when the app opens', async () => {
    const api = recurringApi();
    const runs = () => api.calls.filter((c) => c.path === '/recurring/run');
    renderApp('/');
    // The run starts after the first screen paints.
    await waitFor(() => expect(runs()).toHaveLength(1));
    await screen.findByRole('link', { name: 'Confirmar' });
    expect(runs()).toHaveLength(1);
  });
});
