import { randomUUID } from 'node:crypto';
import type {
  AccountView,
  DebtView,
  PaymentView,
  ProposalView,
  ScheduleView,
  SummaryReport,
} from '@finanz/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, signedInUser, type TestClient } from '../../test/context';
import { findIsolationViolations } from '../../test/tenant-isolation';

const ctx = createTestContext();
afterAll(() => ctx.close());

async function json<T>(
  client: TestClient,
  method: string,
  path: string,
  body?: unknown,
  key = randomUUID(),
) {
  const res = await client.request(method, path, body, { headers: { 'Idempotency-Key': key } });
  return { status: res.status, body: (await res.json()) as T & { error?: { code: string } } };
}

const cop = (pesos: number) => String(BigInt(pesos) * 100n);

/** The fixture's car loan, tracked from 2025-09-30, and a bank account to pay it from. */
async function carLoan() {
  const { client } = await signedInUser(ctx);
  await json(client, 'PUT', '/api/me/preferences', {
    language: 'es',
    timeZone: 'America/Bogota',
    primaryCurrency: 'COP',
  });
  const bank = (
    await json<AccountView>(client, 'POST', '/api/ledger/accounts', {
      name: 'Bancolombia',
      subtype: 'bank',
      currency: 'COP',
      openedOn: '2025-09-30',
      openingBalanceMinor: cop(50_000_000),
    })
  ).body;
  const loan = (
    await json<DebtView>(client, 'POST', '/api/debts', {
      name: 'Crédito vehículo',
      type: 'loan',
      currency: 'COP',
      openedOn: '2025-09-30',
      outstandingMinor: cop(38_441_578),
      rate: '0.012',
      ratePeriod: 'monthly',
      originalPrincipalMinor: cop(48_000_000),
      termMonths: 48,
      installmentMinor: cop(1_321_322),
      startOn: '2024-10-01',
      dueDay: 28,
    })
  ).body;
  return { client, bank, loan };
}

const pay = (client: TestClient, debtId: string, body: Record<string, unknown>) =>
  json<PaymentView>(client, 'POST', `/api/debts/${debtId}/payments`, body);

describe('a loan', () => {
  it('is a liability account owing the opening amount, with its terms', async () => {
    const { client, loan } = await carLoan();
    expect(loan).toMatchObject({
      name: 'Crédito vehículo',
      type: 'loan',
      outstandingMinor: cop(38_441_578),
      rate: '0.012',
      dueDay: 28,
    });
    const accounts = (await json<AccountView[]>(client, 'GET', '/api/ledger/accounts')).body;
    expect(accounts.find((a) => a.id === loan.accountId)).toMatchObject({
      kind: 'liability',
      subtype: 'loan',
      balanceMinor: `-${cop(38_441_578)}`,
    });
  });

  it('proposes the split the bank uses: a month of interest first, rounded to whole pesos', async () => {
    const { client, loan } = await carLoan();
    const { body } = await json<ProposalView>(
      client,
      'GET',
      `/api/debts/${loan.id}/proposal?amountMinor=${cop(1_321_322)}&paidOn=2025-10-28`,
    );
    expect(body).toEqual({
      outstandingMinor: cop(38_441_578),
      interestMinor: cop(461_299),
      principalMinor: cop(860_023),
    });
  });

  it('twelve installments reproduce the fixture’s amortization sheet to the peso', async () => {
    const { client, bank, loan } = await carLoan();
    for (let month = 0; month < 12; month++) {
      const paidOn = new Date(Date.UTC(2025, 9 + month, 28)).toISOString().slice(0, 10);
      const res = await pay(client, loan.id, {
        fromAccountId: bank.id,
        paidOn,
        amountMinor: cop(1_321_322),
      });
      expect(res.status).toBe(201);
    }
    const payments = (await json<PaymentView[]>(client, 'GET', `/api/debts/${loan.id}/payments`))
      .body;
    const total = (k: 'interestMinor' | 'principalMinor') =>
      payments.reduce((s, p) => s + BigInt(p[k]), 0n).toString();
    expect(total('interestMinor')).toBe(cop(4_826_455));
    expect(total('principalMinor')).toBe(cop(11_029_409));
    const after = (await json<DebtView[]>(client, 'GET', '/api/debts')).body[0];
    expect(after?.outstandingMinor).toBe(cop(27_412_169));

    // Only the interest is spending; principal just lowers what you owe.
    const year = (
      await json<SummaryReport>(client, 'GET', '/api/reports/summary?from=2025-10-01&to=2026-09-30')
    ).body;
    expect(year.expensesMinor).toBe(cop(4_826_455));
  });

  it('projects the rest of the loan, ending exactly at zero in its last agreed month', async () => {
    const { client, loan } = await carLoan();
    const { body } = await json<ScheduleView>(client, 'GET', `/api/debts/${loan.id}/schedule`);
    expect(body.neverEnds).toBe(false);
    expect(body.rows.at(-1)?.balanceAfterMinor).toBe('0');
    expect(body.rows.at(-1)?.dueOn.slice(0, 7)).toBe('2028-09');
  });

  it('takes the split the user enters (the bank’s statement wins)', async () => {
    const { client, bank, loan } = await carLoan();
    const res = await pay(client, loan.id, {
      fromAccountId: bank.id,
      paidOn: '2025-10-28',
      amountMinor: cop(1_400_000),
      interestMinor: cop(461_299),
      feesMinor: cop(78_678),
    });
    expect(res.body).toMatchObject({
      amountMinor: cop(1_400_000),
      interestMinor: cop(461_299),
      feesMinor: cop(78_678),
      principalMinor: cop(860_023),
    });
  });

  it('refuses paying more than is owed, from a card, or from another currency', async () => {
    const { client, bank, loan } = await carLoan();
    expect(
      (
        await pay(client, loan.id, {
          fromAccountId: bank.id,
          paidOn: '2025-10-28',
          amountMinor: cop(45_000_000),
        })
      ).body.error?.code,
    ).toBe('debt.overpayment');
    const visa = (
      await json<AccountView>(client, 'POST', '/api/ledger/accounts', {
        name: 'Visa',
        subtype: 'credit_card',
        currency: 'COP',
        openedOn: '2025-09-30',
      })
    ).body;
    expect(
      (
        await pay(client, loan.id, {
          fromAccountId: visa.id,
          paidOn: '2025-10-28',
          amountMinor: cop(1_000),
        })
      ).body.error?.code,
    ).toBe('debt.source_account');
    const wise = (
      await json<AccountView>(client, 'POST', '/api/ledger/accounts', {
        name: 'Wise',
        subtype: 'bank',
        currency: 'USD',
        openedOn: '2025-09-30',
        openingBalanceMinor: '100000',
      })
    ).body;
    expect(
      (
        await pay(client, loan.id, {
          fromAccountId: wise.id,
          paidOn: '2025-10-28',
          amountMinor: '100',
        })
      ).body.error?.code,
    ).toBe('debt.currency_mismatch');
    expect(
      (
        await pay(client, loan.id, {
          fromAccountId: bank.id,
          paidOn: '2025-10-28',
          amountMinor: cop(100),
          interestMinor: cop(200),
        })
      ).body.error?.code,
    ).toBe('debt.split_exceeds_payment');
  });

  it('a payment changes only through Deudas: the generic edit is refused; edit and void here work', async () => {
    const { client, bank, loan } = await carLoan();
    const p = (
      await pay(client, loan.id, {
        fromAccountId: bank.id,
        paidOn: '2025-10-28',
        amountMinor: cop(1_321_322),
      })
    ).body;
    const generic = await json(client, 'POST', `/api/ledger/transactions/${p.transactionId}/void`, {
      version: 1,
    });
    expect(generic.body.error?.code).toBe('ledger.managed_transaction');

    const edited = await json<PaymentView>(
      client,
      'PUT',
      `/api/debts/${loan.id}/payments/${p.transactionId}`,
      {
        version: 1,
        fromAccountId: bank.id,
        paidOn: '2025-10-28',
        amountMinor: cop(1_500_000),
      },
    );
    expect(edited.body).toMatchObject({
      amountMinor: cop(1_500_000),
      interestMinor: cop(461_299),
      principalMinor: cop(1_038_701),
      version: 2,
    });

    expect(
      (
        await json(client, 'POST', `/api/debts/${loan.id}/payments/${p.transactionId}/void`, {
          version: 2,
        })
      ).status,
    ).toBe(200);
    const after = (await json<DebtView[]>(client, 'GET', '/api/debts')).body[0];
    expect(after?.outstandingMinor).toBe(cop(38_441_578));
  });

  it("two payments at the same moment can't both pay off more than is owed", async () => {
    const { client, bank, loan } = await carLoan();
    const body = {
      fromAccountId: bank.id,
      paidOn: '2025-10-28',
      amountMinor: cop(30_000_000),
      interestMinor: '0',
    };
    const results = await Promise.all([pay(client, loan.id, body), pay(client, loan.id, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(results.find((r) => r.status === 422)?.body.error?.code).toBe('debt.overpayment');
  });

  it('retrying a payment with the same key records it once', async () => {
    const { client, bank, loan } = await carLoan();
    const key = randomUUID();
    const body = { fromAccountId: bank.id, paidOn: '2025-10-28', amountMinor: cop(1_321_322) };
    await Promise.all([
      json(client, 'POST', `/api/debts/${loan.id}/payments`, body, key),
      json(client, 'POST', `/api/debts/${loan.id}/payments`, body, key),
    ]);
    expect(
      (await json<PaymentView[]>(client, 'GET', `/api/debts/${loan.id}/payments`)).body,
    ).toHaveLength(1);
  });
});

describe('a credit card', () => {
  it('has a limit and cut/payment days; paying the statement is all principal', async () => {
    const { client, bank } = await carLoan();
    const card = (
      await json<DebtView>(client, 'POST', '/api/debts', {
        name: 'Visa Bancolombia',
        type: 'credit_card',
        currency: 'COP',
        openedOn: '2025-09-30',
        outstandingMinor: cop(2_340_000),
        creditLimitMinor: cop(25_000_000),
        statementDay: 15,
        dueDay: 30,
      })
    ).body;
    const res = await pay(client, card.id, {
      fromAccountId: bank.id,
      paidOn: '2025-09-30',
      amountMinor: cop(2_340_000),
    });
    expect(res.body).toMatchObject({ principalMinor: cop(2_340_000), interestMinor: '0' });
    expect(
      (await json<DebtView[]>(client, 'GET', '/api/debts')).body.find((d) => d.id === card.id)
        ?.outstandingMinor,
    ).toBe('0');
  });
});

describe('debts: tenant isolation', () => {
  it("never shows, pays or changes another user's debts", async () => {
    const violations = await findIsolationViolations(ctx, async (owner, intruder) => {
      await json(owner, 'PUT', '/api/me/preferences', {
        language: 'es',
        timeZone: 'America/Bogota',
        primaryCurrency: 'COP',
      });
      const bank = (
        await json<AccountView>(owner, 'POST', '/api/ledger/accounts', {
          name: 'Banco',
          subtype: 'bank',
          currency: 'COP',
          openedOn: '2025-09-30',
          openingBalanceMinor: cop(10_000_000),
        })
      ).body;
      const debt = (
        await json<DebtView>(owner, 'POST', '/api/debts', {
          name: 'Préstamo secreto 5521',
          type: 'loan',
          currency: 'COP',
          openedOn: '2025-09-30',
          outstandingMinor: cop(7_919_331),
          rate: '0.012',
          ratePeriod: 'monthly',
          dueDay: 5,
        })
      ).body;
      const p = (
        await pay(owner, debt.id, {
          fromAccountId: bank.id,
          paidOn: '2025-10-05',
          amountMinor: cop(1_000_000),
        })
      ).body;
      const intruderBank = (
        await json<AccountView>(intruder, 'POST', '/api/ledger/accounts', {
          name: 'Mío',
          subtype: 'bank',
          currency: 'COP',
          openedOn: '2025-09-30',
          openingBalanceMinor: cop(1_000),
        })
      ).body;
      return {
        secrets: ['Préstamo secreto 5521', cop(7_919_331)],
        probes: [
          { kind: 'list', method: 'GET', path: '/api/debts', intruderSees: [] },
          { kind: 'single', method: 'GET', path: `/api/debts/${debt.id}/payments` },
          { kind: 'single', method: 'GET', path: `/api/debts/${debt.id}/schedule` },
          {
            kind: 'single',
            method: 'GET',
            path: `/api/debts/${debt.id}/proposal?amountMinor=100&paidOn=2025-10-05`,
          },
          { kind: 'write', method: 'PATCH', path: `/api/debts/${debt.id}`, body: { dueDay: 9 } },
          {
            kind: 'write',
            method: 'POST',
            path: `/api/debts/${debt.id}/payments`,
            body: { fromAccountId: intruderBank.id, paidOn: '2025-10-06', amountMinor: '100' },
          },
          {
            kind: 'write',
            method: 'POST',
            path: `/api/debts/${debt.id}/payments/${p.transactionId}/void`,
            body: { version: 1 },
          },
        ],
        ownerDataIntact: async () => {
          const [mine] = (await json<DebtView[]>(owner, 'GET', '/api/debts')).body;
          const payments = (
            await json<PaymentView[]>(owner, 'GET', `/api/debts/${debt.id}/payments`)
          ).body;
          return mine?.dueDay === 5 && payments.length === 1 && payments[0]?.status === 'posted';
        },
      };
    });
    expect(violations).toEqual([]);
  });
});
