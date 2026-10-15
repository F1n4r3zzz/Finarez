import { randomUUID } from 'node:crypto';
import type {
  AccountView,
  BridgeReport,
  Category,
  MonthlyReport,
  NetWorthReport,
  SummaryReport,
} from '@finanz/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, signedInUser, type TestClient } from '../../test/context';
import { findIsolationViolations } from '../../test/tenant-isolation';

const ctx = createTestContext();
afterAll(() => ctx.close());

async function json<T>(client: TestClient, method: string, path: string, body?: unknown) {
  const res = await client.request(method, path, body, {
    headers: { 'Idempotency-Key': randomUUID() },
  });
  return { status: res.status, body: (await res.json()) as T };
}

/** A freelancer's first months: COP bank, USD Wise, a card; monthly USD/COP rates. */
async function freelancer(client: TestClient) {
  await json(client, 'PUT', '/api/me/preferences', {
    language: 'es',
    timeZone: 'America/Bogota',
    primaryCurrency: 'COP',
  });
  for (const [validFrom, rate] of [
    ['2025-09-01', '3980'],
    ['2025-10-01', '4010.5'],
    ['2025-11-01', '3955.25'],
  ]) {
    await json(client, 'POST', '/api/currency/rates', {
      base: 'USD',
      quote: 'COP',
      validFrom,
      rate,
    });
  }
  const categories = (await json<Category[]>(client, 'GET', '/api/categories')).body;
  const cat = (name: string, kind = 'expense') =>
    categories.find((c) => c.name === name && c.kind === kind)?.id as string;
  const account = async (body: Record<string, unknown>) =>
    (
      await json<AccountView>(client, 'POST', '/api/ledger/accounts', {
        openedOn: '2025-09-30',
        ...body,
      })
    ).body;
  const bank = await account({
    name: 'Bancolombia',
    subtype: 'bank',
    currency: 'COP',
    openingBalanceMinor: '1850000000',
  });
  const wise = await account({
    name: 'Wise',
    subtype: 'bank',
    currency: 'USD',
    openingBalanceMinor: '215000',
  });
  const visa = await account({
    name: 'Visa',
    subtype: 'credit_card',
    currency: 'COP',
    openingBalanceMinor: '-234000000',
  });
  const post = (draft: Record<string, unknown>) =>
    json(client, 'POST', '/api/ledger/transactions', draft);

  await post({
    kind: 'income',
    occurredOn: '2025-10-05',
    description: 'Client A',
    accountId: bank.id,
    lines: [{ categoryId: cat('Ingresos por servicios', 'income'), amountMinor: '1200000000' }],
  });
  await post({
    kind: 'income',
    occurredOn: '2025-10-20',
    description: 'Client B',
    accountId: wise.id,
    lines: [{ categoryId: cat('Ingresos por servicios', 'income'), amountMinor: '300000' }],
  });
  await post({
    kind: 'expense',
    occurredOn: '2025-10-07',
    description: 'Arriendo',
    accountId: bank.id,
    lines: [{ categoryId: cat('Vivienda'), amountMinor: '350000000' }],
  });
  await post({
    kind: 'expense',
    occurredOn: '2025-10-12',
    description: 'Éxito',
    accountId: visa.id,
    lines: [
      { categoryId: cat('Mercado'), amountMinor: '22500000' },
      { categoryId: cat('Hogar'), amountMinor: '8500000' },
    ],
  });
  await post({
    kind: 'transfer',
    occurredOn: '2025-10-30',
    description: 'Pago Visa',
    from: { accountId: bank.id, amountMinor: '265000000' },
    to: { accountId: visa.id, amountMinor: '265000000' },
  });
  await post({
    kind: 'transfer',
    occurredOn: '2025-11-03',
    description: 'Wise a Bancolombia',
    from: { accountId: wise.id, amountMinor: '200000' },
    to: { accountId: bank.id, amountMinor: '795000000' },
    fee: { amountMinor: '500', categoryId: cat('Comisiones bancarias') },
  });
  return { bank, wise, visa, cat };
}

describe('reports in the primary currency', () => {
  it('income and expenses come from category lines only, each at its own month’s rate', async () => {
    const { client } = await signedInUser(ctx);
    const { cat } = await freelancer(client);
    const { body } = await json<SummaryReport>(
      client,
      'GET',
      '/api/reports/summary?from=2025-10-01&to=2025-10-31',
    );
    // 12.000.000 COP + 3.000 USD × 4.010,5 = 12.031.500
    expect(body.incomeMinor).toBe(String(1200000000 + 1203150000));
    // rent + split purchase; the card payment is a transfer and doesn't count
    expect(body.expensesMinor).toBe('381000000');
    expect(body.netMinor).toBe(String(1200000000 + 1203150000 - 381000000));
    expect(body.expensesByCategory[0]).toEqual({
      categoryId: cat('Vivienda'),
      amountMinor: '350000000',
    });
    expect(body).toMatchObject({ currency: 'COP', complete: true, excluded: [] });
  });

  it('net worth adds every account at the day’s rate; liabilities subtract', async () => {
    const { client } = await signedInUser(ctx);
    await freelancer(client);
    const { body } = await json<NetWorthReport>(
      client,
      'GET',
      '/api/reports/net-worth?on=2025-09-30',
    );
    // 18.500.000 + 2.150 USD × 3.980 − 2.340.000
    expect(body.totalMinor).toBe(String(1850000000 + 855700000 - 234000000));
    expect(body.complete).toBe(true);
  });

  it('the bridge explains the change in net worth exactly', async () => {
    const { client } = await signedInUser(ctx);
    await freelancer(client);
    const { body: b } = await json<BridgeReport>(
      client,
      'GET',
      '/api/reports/bridge?from=2025-10-01&to=2025-11-30',
    );
    const parts = [
      'netMinor',
      'valuationMinor',
      'openingContributionsMinor',
      'realizedFxMinor',
      'unrealizedFxMinor',
      'roundingMinor',
    ] as const;
    const sum = parts.reduce((acc, k) => acc + BigInt(b[k]), 0n);
    expect(BigInt(b.endMinor) - BigInt(b.startMinor)).toBe(sum);
    // 2.000 USD sold for 7.950.000 COP when the reference was 3.955,25: a realized gain of 39.500
    expect(b.realizedFxMinor).toBe('3950000');
  });

  it('says what it could not convert instead of treating it as zero', async () => {
    const { client } = await signedInUser(ctx);
    await freelancer(client);
    await json(client, 'POST', '/api/ledger/accounts', {
      name: 'Revolut',
      subtype: 'bank',
      currency: 'EUR',
      openedOn: '2025-09-30',
      openingBalanceMinor: '50000',
    });
    const { body } = await json<NetWorthReport>(
      client,
      'GET',
      '/api/reports/net-worth?on=2025-10-31',
    );
    expect(body.complete).toBe(false);
    expect(body.excluded).toEqual([
      expect.objectContaining({ currency: 'EUR', amountMinor: '50000' }),
    ]);
  });

  it('shows each account’s balance today in its own currency', async () => {
    const { client } = await signedInUser(ctx);
    await freelancer(client);
    const accounts = (await json<AccountView[]>(client, 'GET', '/api/ledger/accounts')).body;
    expect(Object.fromEntries(accounts.map((a) => [a.name, a.balanceMinor]))).toEqual({
      Bancolombia: String(1850000000 + 1200000000 - 350000000 - 265000000 + 795000000),
      Visa: String(-234000000 - 31000000 + 265000000),
      Wise: String(215000 + 300000 - 200500),
    });
  });
});

describe('monthly report', () => {
  it('gives each month the same figures as a summary of that month, empty months included', async () => {
    const { client } = await signedInUser(ctx);
    await freelancer(client);
    const { status, body } = await json<MonthlyReport>(
      client,
      'GET',
      '/api/reports/monthly?from=2025-09-15&to=2025-12-31',
    );
    expect(status).toBe(200);
    expect(body.months.map((m) => [m.month, m.from, m.to])).toEqual([
      ['2025-09', '2025-09-15', '2025-09-30'],
      ['2025-10', '2025-10-01', '2025-10-31'],
      ['2025-11', '2025-11-01', '2025-11-30'],
      ['2025-12', '2025-12-01', '2025-12-31'],
    ]);
    for (const m of body.months) {
      const s = (
        await json<SummaryReport>(client, 'GET', `/api/reports/summary?from=${m.from}&to=${m.to}`)
      ).body;
      expect(m).toEqual({
        month: m.month,
        from: m.from,
        to: m.to,
        incomeMinor: s.incomeMinor,
        expensesMinor: s.expensesMinor,
        netMinor: s.netMinor,
        expensesByCategory: s.expensesByCategory,
      });
    }
    expect(body.months[1]?.incomeMinor).not.toBe('0');
    expect(body.months[3]).toMatchObject({ incomeMinor: '0', expensesMinor: '0' });
  });

  it('refuses ranges that run backwards or span more than five years', async () => {
    const { client } = await signedInUser(ctx);
    await json(client, 'PUT', '/api/me/preferences', {
      language: 'es',
      timeZone: 'America/Bogota',
      primaryCurrency: 'COP',
    });
    for (const q of ['from=2026-02-01&to=2026-01-31', 'from=2020-01-01&to=2025-01-01']) {
      const res = await json<{ error: { code: string } }>(
        client,
        'GET',
        `/api/reports/monthly?${q}`,
      );
      expect([res.status, res.body.error.code]).toEqual([400, 'reports.range_too_long']);
    }
  });
});

describe('stale rates', () => {
  it('says which rates were older than 45 days when used (CP2 code #8)', async () => {
    const { client } = await signedInUser(ctx);
    await freelancer(client);
    // The last USD/COP rate starts 2025-11-01: valid but stale by late December.
    const { body } = await json<NetWorthReport>(
      client,
      'GET',
      '/api/reports/net-worth?on=2025-12-31',
    );
    expect(body.complete).toBe(true);
    expect(body.staleRateIds).toHaveLength(1);
    const fresh = await json<NetWorthReport>(client, 'GET', '/api/reports/net-worth?on=2025-11-15');
    expect(fresh.body.staleRateIds).toEqual([]);
  });
});

describe('reports: tenant isolation', () => {
  it("never counts another user's money", async () => {
    const violations = await findIsolationViolations(ctx, async (owner, intruder) => {
      await freelancer(owner);
      await json(intruder, 'PUT', '/api/me/preferences', {
        language: 'es',
        timeZone: 'America/Bogota',
        primaryCurrency: 'COP',
      });
      const empty = {
        currency: 'COP',
        complete: true,
        excluded: [],
        rateIds: [],
        staleRateIds: [],
      };
      return {
        secrets: ['1200000000', '1850000000'],
        probes: [
          {
            kind: 'aggregate',
            method: 'GET',
            path: '/api/reports/summary?from=2025-10-01&to=2025-10-31',
            intruderSees: {
              from: '2025-10-01',
              to: '2025-10-31',
              incomeMinor: '0',
              expensesMinor: '0',
              netMinor: '0',
              incomeByCategory: [],
              expensesByCategory: [],
              ...empty,
            },
          },
          {
            kind: 'aggregate',
            method: 'GET',
            path: '/api/reports/monthly?from=2025-10-01&to=2025-10-31',
            intruderSees: {
              from: '2025-10-01',
              to: '2025-10-31',
              months: [
                {
                  month: '2025-10',
                  from: '2025-10-01',
                  to: '2025-10-31',
                  incomeMinor: '0',
                  expensesMinor: '0',
                  netMinor: '0',
                  expensesByCategory: [],
                },
              ],
              ...empty,
            },
          },
          {
            kind: 'aggregate',
            method: 'GET',
            path: '/api/reports/net-worth?on=2025-10-31',
            intruderSees: {
              on: '2025-10-31',
              totalMinor: '0',
              assetsMinor: '0',
              liabilitiesMinor: '0',
              byAccount: [],
              ...empty,
            },
          },
        ],
        ownerDataIntact: async () => true,
      };
    });
    expect(violations).toEqual([]);
  });
});
