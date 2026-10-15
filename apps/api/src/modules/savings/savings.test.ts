import { randomUUID } from 'node:crypto';
import type {
  AccountView,
  AllocationView,
  GoalView,
  NetWorthReport,
  SavingsAccountView,
  SummaryReport,
  TransactionView,
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
  key: string = randomUUID(),
) {
  const res = await client.request(method, path, body, { headers: { 'Idempotency-Key': key } });
  return { status: res.status, body: (await res.json()) as T & { error?: { code: string } } };
}

const cop = (pesos: number) => String(BigInt(pesos) * 100n);
const TODAY = '2026-10-15';

/** A user with COP and USD accounts, a card, and today's USD/COP rate. */
async function saver(client: TestClient) {
  await json(client, 'PUT', '/api/me/preferences', {
    language: 'es',
    timeZone: 'America/Bogota',
    primaryCurrency: 'COP',
  });
  await json(client, 'POST', '/api/currency/rates', {
    base: 'USD',
    quote: 'COP',
    validFrom: '2025-01-01',
    rate: '4000',
  });
  const account = async (name: string, subtype: string, currency: string, opening: string) =>
    (
      await json<AccountView>(client, 'POST', '/api/ledger/accounts', {
        name,
        subtype,
        currency,
        openedOn: '2025-09-30',
        ...(opening === '0' ? {} : { openingBalanceMinor: opening }),
      })
    ).body;
  return {
    bank: await account('Bancolombia', 'bank', 'COP', cop(10_000_000)),
    fund: await account('Fondo', 'investment', 'COP', '0'),
    wise: await account('Wise', 'bank', 'USD', '100000'),
    visa: await account('Visa', 'credit_card', 'COP', `-${cop(500_000)}`),
  };
}

const goal = async (client: TestClient, body: Record<string, unknown>) =>
  json<GoalView>(client, 'POST', '/api/savings/goals', { currency: 'COP', ...body });

const allocate = (
  client: TestClient,
  goalId: string,
  body: Record<string, unknown>,
  key?: string,
) =>
  json<AllocationView>(
    client,
    'POST',
    `/api/savings/goals/${goalId}/allocations`,
    { occurredOn: '2025-10-27', ...body },
    key,
  );

const goals = async (client: TestClient) =>
  (await json<GoalView[]>(client, 'GET', '/api/savings/goals')).body;
const accounts = async (client: TestClient) =>
  (await json<SavingsAccountView[]>(client, 'GET', '/api/savings/accounts')).body;
const netWorth = async (client: TestClient) =>
  (await json<NetWorthReport>(client, 'GET', `/api/reports/net-worth?on=${TODAY}`)).body.totalMinor;

describe('savings goals', () => {
  it('set money aside without spending it: net worth, income and expenses never change', async () => {
    const { client } = await signedInUser(ctx);
    const { bank, fund } = await saver(client);
    const before = await netWorth(client);
    const emergency = (
      await goal(client, { name: 'Fondo de emergencia', targetMinor: cop(60_000_000) })
    ).body;

    // An earmark over money already in the bank…
    expect(
      (
        await allocate(client, emergency.id, {
          direction: 'contribute',
          accountId: bank.id,
          amountMinor: cop(1_000_000),
        })
      ).status,
    ).toBe(201);
    // …and a contribution that also moves the money to the fund.
    const moved = (
      await allocate(client, emergency.id, {
        direction: 'contribute',
        accountId: fund.id,
        fromAccountId: bank.id,
        amountMinor: cop(1_800_000),
      })
    ).body;
    expect(moved.transactionId).not.toBeNull();

    const [g] = await goals(client);
    expect(g).toMatchObject({ savedMinor: cop(2_800_000), targetMinor: cop(60_000_000) });
    expect(await netWorth(client)).toBe(before);
    const summary = (
      await json<SummaryReport>(client, 'GET', '/api/reports/summary?from=2025-10-01&to=2025-10-31')
    ).body;
    expect([summary.incomeMinor, summary.expensesMinor]).toEqual(['0', '0']);

    // The transfer is savings' own: shown in Movimientos, edited only from Ahorros.
    const transfer = (
      await json<TransactionView>(client, 'GET', `/api/ledger/transactions/${moved.transactionId}`)
    ).body;
    expect(transfer).toMatchObject({
      kind: 'transfer',
      managedBy: 'savings',
      description: 'Aporte — Fondo de emergencia',
    });

    const byAccount = new Map((await accounts(client)).map((a) => [a.accountId, a]));
    expect(byAccount.get(bank.id)).toMatchObject({
      balanceMinor: cop(8_200_000),
      allocatedMinor: cop(1_000_000),
      availableMinor: cop(7_200_000),
    });
    expect(byAccount.get(fund.id)).toMatchObject({
      balanceMinor: cop(1_800_000),
      allocatedMinor: cop(1_800_000),
      availableMinor: '0',
    });
  });

  it('releases money only up to what the goal holds in that account', async () => {
    const { client } = await signedInUser(ctx);
    const { bank } = await saver(client);
    const trip = (await goal(client, { name: 'Viaje a Japón', targetMinor: cop(25_000_000) })).body;
    await allocate(client, trip.id, {
      direction: 'contribute',
      accountId: bank.id,
      amountMinor: cop(600_000),
    });
    const tooMuch = await allocate(client, trip.id, {
      direction: 'withdraw',
      accountId: bank.id,
      amountMinor: cop(700_000),
    });
    expect([tooMuch.status, tooMuch.body.error?.code]).toEqual([422, 'savings.withdraw_exceeds']);
    expect(
      (
        await allocate(client, trip.id, {
          direction: 'withdraw',
          accountId: bank.id,
          amountMinor: cop(200_000),
        })
      ).status,
    ).toBe(201);
    expect((await goals(client))[0]?.savedMinor).toBe(cop(400_000));
  });

  it('undoes a contribution and its transfer, but not one the goal already released', async () => {
    const { client } = await signedInUser(ctx);
    const { bank, fund } = await saver(client);
    const g = (await goal(client, { name: 'Apartamento', targetMinor: cop(120_000_000) })).body;
    const moved = (
      await allocate(client, g.id, {
        direction: 'contribute',
        accountId: fund.id,
        fromAccountId: bank.id,
        amountMinor: cop(1_000_000),
      })
    ).body;
    const kept = (
      await allocate(client, g.id, {
        direction: 'contribute',
        accountId: bank.id,
        amountMinor: cop(300_000),
      })
    ).body;
    await allocate(client, g.id, {
      direction: 'withdraw',
      accountId: bank.id,
      amountMinor: cop(300_000),
    });

    const blocked = await json(
      client,
      'POST',
      `/api/savings/goals/${g.id}/allocations/${kept.id}/void`,
    );
    expect([blocked.status, blocked.body.error?.code]).toEqual([
      422,
      'savings.void_breaks_balance',
    ]);

    expect(
      (await json(client, 'POST', `/api/savings/goals/${g.id}/allocations/${moved.id}/void`))
        .status,
    ).toBe(200);
    const transfer = (
      await json<TransactionView>(client, 'GET', `/api/ledger/transactions/${moved.transactionId}`)
    ).body;
    expect(transfer.status).toBe('void');
    const fundNow = (await accounts(client)).find((a) => a.accountId === fund.id);
    expect(fundNow).toMatchObject({ balanceMinor: '0', allocatedMinor: '0' });
    const history = (
      await json<AllocationView[]>(client, 'GET', `/api/savings/goals/${g.id}/allocations`)
    ).body;
    expect(history.find((a) => a.id === moved.id)?.voided).toBe(true);
    expect((await goals(client))[0]?.savedMinor).toBe('0');
  });

  it('counts money in other currencies at today’s rate, and says what it could not convert', async () => {
    const { client } = await signedInUser(ctx);
    const { wise } = await saver(client);
    const g = (await goal(client, { name: 'Viaje', targetMinor: cop(10_000_000) })).body;
    await allocate(client, g.id, {
      direction: 'contribute',
      accountId: wise.id,
      amountMinor: '50000',
    });
    expect((await goals(client))[0]?.savedMinor).toBe(cop(2_000_000)); // 500 USD × 4000

    const inMxn = (
      await goal(client, { name: 'En pesos mexicanos', currency: 'MXN', targetMinor: '100000' })
    ).body;
    await allocate(client, inMxn.id, {
      direction: 'contribute',
      accountId: wise.id,
      amountMinor: '1000',
    });
    const mx = (await goals(client)).find((x) => x.id === inMxn.id);
    expect(mx?.savedMinor).toBe('0');
    expect(mx?.excluded).toEqual([
      expect.objectContaining({ currency: 'USD', amountMinor: '1000' }),
    ]);
  });

  it('says how much to save each month to arrive on time', async () => {
    const { client } = await signedInUser(ctx);
    await saver(client);
    const g = (
      await goal(client, {
        name: 'Con fecha',
        targetMinor: cop(1_000_000),
        targetDate: '2099-12-31',
      })
    ).body;
    expect(g.monthlyNeededMinor).not.toBeNull();
    expect(BigInt(g.monthlyNeededMinor ?? '0') % 100n).toBe(0n); // whole pesos
    const noDate = (await goal(client, { name: 'Sin fecha', targetMinor: cop(1_000_000) })).body;
    expect(noDate.monthlyNeededMinor).toBeNull();
  });

  it('refuses accounts that can’t hold savings, and transfers that don’t add up', async () => {
    const { client } = await signedInUser(ctx);
    const { bank, fund, wise, visa } = await saver(client);
    const g = (await goal(client, { name: 'Meta', targetMinor: cop(1_000) })).body;
    const tries = [
      [{ accountId: visa.id }, 'savings.account'],
      [{ accountId: fund.id, fromAccountId: fund.id }, 'savings.same_account'],
      [{ accountId: fund.id, fromAccountId: wise.id }, 'savings.transfer_currency'],
      [{ accountId: fund.id, fromAccountId: visa.id }, 'savings.account'],
    ] as const;
    for (const [body, code] of tries) {
      const res = await allocate(client, g.id, {
        direction: 'contribute',
        amountMinor: cop(100),
        ...body,
      });
      expect([res.status, res.body.error?.code]).toEqual([422, code]);
    }
    const twice = await goal(client, { name: 'meta', targetMinor: cop(5) });
    expect([twice.status, twice.body.error?.code]).toEqual([409, 'savings.duplicate_name']);
    expect((await accounts(client)).find((a) => a.accountId === bank.id)?.allocatedMinor).toBe('0');
  });

  it('archives a goal only once it is empty, and takes nothing more afterwards', async () => {
    const { client } = await signedInUser(ctx);
    const { bank } = await saver(client);
    const g = (await goal(client, { name: 'Terminada', targetMinor: cop(1_000) })).body;
    await allocate(client, g.id, {
      direction: 'contribute',
      accountId: bank.id,
      amountMinor: cop(500),
    });
    const full = await json(client, 'POST', `/api/savings/goals/${g.id}/archive`);
    expect([full.status, full.body.error?.code]).toEqual([422, 'savings.goal_not_empty']);
    await allocate(client, g.id, {
      direction: 'withdraw',
      accountId: bank.id,
      amountMinor: cop(500),
    });
    const done = await json<GoalView>(client, 'POST', `/api/savings/goals/${g.id}/archive`);
    expect(done.body.archived).toBe(true);
    const late = await allocate(client, g.id, {
      direction: 'contribute',
      accountId: bank.id,
      amountMinor: cop(1),
    });
    expect(late.body.error?.code).toBe('savings.goal_archived');
  });

  it('records a contribution once, even if the request is sent twice', async () => {
    const { client } = await signedInUser(ctx);
    const { bank, fund } = await saver(client);
    const g = (await goal(client, { name: 'Una vez', targetMinor: cop(1_000_000) })).body;
    const key = randomUUID();
    const body = {
      direction: 'contribute',
      accountId: fund.id,
      fromAccountId: bank.id,
      amountMinor: cop(1_000),
    };
    const [a, b] = await Promise.all([
      allocate(client, g.id, body, key),
      allocate(client, g.id, body, key),
    ]);
    expect(a.body.id).toBe(b.body.id);
    expect((await goals(client))[0]?.savedMinor).toBe(cop(1_000));
  });
});

describe('savings: tenant isolation', () => {
  it("never shows or changes another user's goals", async () => {
    const violations = await findIsolationViolations(ctx, async (owner, intruder) => {
      const { bank } = await saver(owner);
      const g = (await goal(owner, { name: 'Meta secreta 8812', targetMinor: cop(4_321_987) }))
        .body;
      const a = (
        await allocate(owner, g.id, {
          direction: 'contribute',
          accountId: bank.id,
          amountMinor: cop(77_777),
        })
      ).body;
      const mine = await saver(intruder);
      return {
        secrets: ['Meta secreta 8812', cop(4_321_987), cop(77_777)],
        probes: [
          { kind: 'list', method: 'GET', path: '/api/savings/goals', intruderSees: [] },
          {
            kind: 'aggregate',
            method: 'GET',
            path: '/api/savings/accounts',
            intruderSees: await accounts(intruder),
          },
          { kind: 'single', method: 'GET', path: `/api/savings/goals/${g.id}/allocations` },
          {
            kind: 'write',
            method: 'PATCH',
            path: `/api/savings/goals/${g.id}`,
            body: { name: 'X' },
          },
          { kind: 'write', method: 'POST', path: `/api/savings/goals/${g.id}/archive` },
          {
            kind: 'write',
            method: 'POST',
            path: `/api/savings/goals/${g.id}/allocations`,
            body: {
              direction: 'contribute',
              accountId: mine.bank.id,
              amountMinor: '100',
              occurredOn: '2025-10-27',
            },
          },
          {
            kind: 'write',
            method: 'POST',
            path: `/api/savings/goals/${g.id}/allocations/${a.id}/void`,
          },
        ],
        ownerDataIntact: async () => {
          const [mineGoal] = await goals(owner);
          return mineGoal?.name === 'Meta secreta 8812' && mineGoal.savedMinor === cop(77_777);
        },
      };
    });
    expect(violations).toEqual([]);
  });

  it("can't set aside money in another user's account", async () => {
    const owner = await signedInUser(ctx);
    const intruder = await signedInUser(ctx);
    const { bank } = await saver(owner.client);
    await saver(intruder.client);
    const g = (await goal(intruder.client, { name: 'Mía', targetMinor: cop(1_000) })).body;
    const res = await allocate(intruder.client, g.id, {
      direction: 'contribute',
      accountId: bank.id,
      amountMinor: cop(1),
    });
    expect([res.status, res.body.error?.code]).toEqual([422, 'savings.account']);
  });
});
