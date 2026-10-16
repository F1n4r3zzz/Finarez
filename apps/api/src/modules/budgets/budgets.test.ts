import { randomUUID } from 'node:crypto';
import type { AccountView, BudgetPeriodView, BudgetView, Category } from '@finanz/contracts';
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

/** A user with COP and USD accounts, a card, a MXN wallet (no MXN rate) and USD/COP 4000. */
async function spender(client: TestClient) {
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
  const categories = (await json<Category[]>(client, 'GET', '/api/categories')).body;
  const cat = (name: string, kind = 'expense') => {
    const found = categories.find((c) => c.name === name && c.kind === kind);
    if (!found) throw new Error(`No category ${name}`);
    return found.id;
  };
  const account = async (name: string, subtype: string, currency: string) =>
    (
      await json<AccountView>(client, 'POST', '/api/ledger/accounts', {
        name,
        subtype,
        currency,
        openedOn: '2025-09-30',
      })
    ).body;
  const accounts = {
    bank: await account('Bancolombia', 'bank', 'COP'),
    wise: await account('Wise', 'bank', 'USD'),
    visa: await account('Visa', 'credit_card', 'COP'),
    pesos: await account('Pesos mexicanos', 'cash', 'MXN'),
  };
  const spend = async (
    accountId: string,
    occurredOn: string,
    lines: [category: string, amountMinor: string][],
  ) => {
    const res = await json(client, 'POST', '/api/ledger/transactions', {
      kind: 'expense',
      occurredOn,
      description: 'Compra',
      accountId,
      lines: lines.map(([category, amountMinor]) => ({ categoryId: cat(category), amountMinor })),
    });
    expect(res.status).toBe(201);
  };
  return { cat, accounts, spend };
}

const budget = (client: TestClient, body: Record<string, unknown>, key?: string) =>
  json<BudgetView>(
    client,
    'POST',
    '/api/budgets',
    { period: 'monthly', currency: 'COP', ...body },
    key,
  );

const list = async (client: TestClient, on: string) =>
  (await json<BudgetView[]>(client, 'GET', `/api/budgets?on=${on}`)).body;

const history = async (client: TestClient, id: string, to: string, count = 12) =>
  (
    await json<BudgetPeriodView[]>(
      client,
      'GET',
      `/api/budgets/${id}/history?to=${to}&count=${count}`,
    )
  ).body;

describe('budgets', () => {
  it('count the category and its subcategories, in the budget currency, net of refunds', async () => {
    const { client } = await signedInUser(ctx);
    const { cat, accounts, spend } = await spender(client);
    const created = await budget(client, {
      categoryId: cat('Vivienda'),
      amountMinor: cop(3_000_000),
      startsOn: '2026-01-15',
    });
    expect(created.status).toBe(201);
    expect(created.body.startsOn).toBe('2026-01-01');

    await spend(accounts.bank.id, '2026-01-05', [['Arriendo', cop(2_500_000)]]);
    await spend(accounts.visa.id, '2026-01-09', [
      ['Vivienda', cop(300_000)],
      ['Mercado', cop(1_000_000)],
    ]);
    // A refund on a subcategory reduces what was spent.
    await spend(accounts.bank.id, '2026-01-20', [['Reparaciones y mantenimiento', cop(-100_000)]]);
    // USD 100 at 4000 COP.
    await spend(accounts.wise.id, '2026-02-03', [['Administración', '10000']]);

    const [january] = await list(client, '2026-01-31');
    expect(january?.current).toMatchObject({
      from: '2026-01-01',
      to: '2026-01-31',
      limitMinor: cop(3_000_000),
      carriedMinor: '0',
      availableMinor: cop(3_000_000),
      spentMinor: cop(2_700_000),
      remainingMinor: cop(300_000),
      overspent: false,
      excluded: [],
    });
    const [february] = await list(client, '2026-02-01');
    expect(february?.current?.spentMinor).toBe(cop(400_000));
  });

  it('list what has no rate instead of counting it as zero silently', async () => {
    const { client } = await signedInUser(ctx);
    const { cat, accounts, spend } = await spender(client);
    await budget(client, {
      categoryId: cat('Viajes'),
      amountMinor: cop(500_000),
      startsOn: '2026-06-01',
    });
    await spend(accounts.pesos.id, '2026-06-14', [['Viajes', '50000']]);
    await spend(accounts.bank.id, '2026-06-15', [['Viajes', cop(200_000)]]);
    const [june] = await list(client, '2026-06-30');
    expect(june?.current?.spentMinor).toBe(cop(200_000));
    expect(june?.current?.excluded).toEqual([
      {
        date: '2026-06-14',
        currency: 'MXN',
        component: `expense:${cat('Viajes')}`,
        amountMinor: '50000',
      },
    ]);
  });

  it('change the limit from a period on, keeping the earlier ones', async () => {
    const { client } = await signedInUser(ctx);
    const { cat } = await spender(client);
    const b = (
      await budget(client, {
        categoryId: cat('Mercado'),
        amountMinor: cop(1_000_000),
        startsOn: '2026-01-01',
      })
    ).body;
    const limits = async () =>
      (await history(client, b.id, '2026-05-31')).map((p) => [p.from, p.limitMinor]);

    const raised = await json<BudgetView>(client, 'PATCH', `/api/budgets/${b.id}`, {
      amountMinor: cop(1_200_000),
      from: '2026-03-20',
    });
    expect(raised.status).toBe(200);
    expect(await limits()).toEqual([
      ['2026-01-01', cop(1_000_000)],
      ['2026-02-01', cop(1_000_000)],
      ['2026-03-01', cop(1_200_000)],
      ['2026-04-01', cop(1_200_000)],
      ['2026-05-01', cop(1_200_000)],
    ]);
    // An earlier change replaces the later one; a date before the start means the start.
    await json(client, 'PATCH', `/api/budgets/${b.id}`, {
      amountMinor: cop(900_000),
      from: '2026-02-01',
    });
    await json(client, 'PATCH', `/api/budgets/${b.id}`, {
      amountMinor: cop(800_000),
      from: '2025-06-01',
    });
    expect(await limits()).toEqual(
      ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'].map((m) => [
        m,
        cop(800_000),
      ]),
    );
  });

  it('carry what is left, or overspent, into the next period when asked', async () => {
    const { client } = await signedInUser(ctx);
    const { cat, accounts, spend } = await spender(client);
    const b = (
      await budget(client, {
        categoryId: cat('Restaurantes y domicilios'),
        amountMinor: cop(500_000),
        startsOn: '2026-01-01',
        carryover: true,
      })
    ).body;
    await spend(accounts.bank.id, '2026-01-10', [['Restaurantes y domicilios', cop(400_000)]]);
    await spend(accounts.bank.id, '2026-02-10', [['Restaurantes y domicilios', cop(700_000)]]);
    const rows = (await history(client, b.id, '2026-03-31')).map((p) => [
      p.carriedMinor,
      p.availableMinor,
      p.remainingMinor,
      p.overspent,
    ]);
    expect(rows).toEqual([
      ['0', cop(500_000), cop(100_000), false],
      [cop(100_000), cop(600_000), cop(-100_000), true],
      [cop(-100_000), cop(400_000), cop(400_000), false],
    ]);
    // Turning it off judges each month on its own again.
    await json(client, 'PATCH', `/api/budgets/${b.id}`, { carryover: false });
    expect((await history(client, b.id, '2026-03-31', 1))[0]?.availableMinor).toBe(cop(500_000));
  });

  it('use calendar quarters and years', async () => {
    const { client } = await signedInUser(ctx);
    const { cat, accounts, spend } = await spender(client);
    const yearly = (
      await budget(client, {
        categoryId: cat('Regalos'),
        period: 'yearly',
        amountMinor: cop(2_000_000),
        startsOn: '2026-05-01',
      })
    ).body;
    const quarterly = (
      await budget(client, {
        categoryId: cat('Ropa'),
        period: 'quarterly',
        amountMinor: cop(600_000),
        startsOn: '2026-05-01',
      })
    ).body;
    expect([yearly.startsOn, quarterly.startsOn]).toEqual(['2026-01-01', '2026-04-01']);
    await spend(accounts.bank.id, '2026-02-14', [['Regalos', cop(300_000)]]);
    await spend(accounts.bank.id, '2026-12-20', [['Regalos', cop(900_000)]]);
    await spend(accounts.bank.id, '2026-06-30', [['Ropa', cop(250_000)]]);
    await spend(accounts.bank.id, '2026-07-01', [['Ropa', cop(100_000)]]);
    const byId = new Map((await list(client, '2026-06-15')).map((v) => [v.id, v.current]));
    expect(byId.get(yearly.id)).toMatchObject({
      from: '2026-01-01',
      to: '2026-12-31',
      spentMinor: cop(1_200_000),
    });
    expect(byId.get(quarterly.id)).toMatchObject({
      from: '2026-04-01',
      to: '2026-06-30',
      spentMinor: cop(250_000),
    });
  });

  it('show no period before the budget starts, but its first limit', async () => {
    const { client } = await signedInUser(ctx);
    const { cat } = await spender(client);
    await budget(client, {
      categoryId: cat('Mascotas'),
      amountMinor: cop(250_000),
      startsOn: '2026-11-01',
    });
    const [view] = await list(client, '2026-10-15');
    expect(view?.current).toBeNull();
    expect(view?.limitMinor).toBe(cop(250_000));
  });

  it('take only your active expense categories, one budget each, created once per key', async () => {
    const { client } = await signedInUser(ctx);
    const { cat } = await spender(client);
    const income = await budget(client, {
      categoryId: cat('Ingresos por servicios', 'income'),
      amountMinor: '100',
    });
    expect([income.status, income.body.error?.code]).toEqual([422, 'budgets.category']);
    const unknown = await budget(client, { categoryId: randomUUID(), amountMinor: '100' });
    expect([unknown.status, unknown.body.error?.code]).toEqual([422, 'budgets.category']);

    const key = randomUUID();
    const first = await budget(client, { categoryId: cat('Salud'), amountMinor: '100' }, key);
    const again = await budget(client, { categoryId: cat('Salud'), amountMinor: '100' }, key);
    expect(again.body.id).toBe(first.body.id);
    const duplicate = await budget(client, { categoryId: cat('Salud'), amountMinor: '100' });
    expect([duplicate.status, duplicate.body.error?.code]).toEqual([
      409,
      'budgets.duplicate_category',
    ]);

    // Archived budgets leave the list, stay readable, can't change, and free the category.
    const archived = await json<BudgetView>(
      client,
      'POST',
      `/api/budgets/${first.body.id}/archive`,
    );
    expect(archived.body.archived).toBe(true);
    expect(await list(client, '2026-10-15')).toEqual([]);
    expect((await json<BudgetView>(client, 'GET', `/api/budgets/${first.body.id}`)).status).toBe(
      200,
    );
    const edit = await json(client, 'PATCH', `/api/budgets/${first.body.id}`, {
      amountMinor: '200',
    });
    expect([edit.status, edit.body.error?.code]).toEqual([422, 'budgets.archived']);
    expect((await budget(client, { categoryId: cat('Salud'), amountMinor: '100' })).status).toBe(
      201,
    );

    expect((await json(client, 'GET', `/api/budgets/${randomUUID()}`)).status).toBe(404);
    expect((await json(client, 'GET', '/api/budgets/not-an-id')).status).toBe(404);
  });
});

describe('budgets: tenant isolation', () => {
  it("never shows or changes another user's budgets", async () => {
    const violations = await findIsolationViolations(ctx, async (owner, intruder) => {
      const { cat, accounts, spend } = await spender(owner);
      const b = (
        await budget(owner, {
          categoryId: cat('Educación'),
          amountMinor: cop(4_321_987),
          startsOn: '2026-01-01',
        })
      ).body;
      await spend(accounts.bank.id, '2026-01-12', [['Educación', cop(77_777)]]);
      const mine = await spender(intruder);
      return {
        secrets: [cop(4_321_987), cop(77_777)],
        probes: [
          { kind: 'list', method: 'GET', path: '/api/budgets?on=2026-01-31', intruderSees: [] },
          { kind: 'single', method: 'GET', path: `/api/budgets/${b.id}` },
          { kind: 'nested', method: 'GET', path: `/api/budgets/${b.id}/history?to=2026-01-31` },
          {
            kind: 'write',
            method: 'PATCH',
            path: `/api/budgets/${b.id}`,
            body: { amountMinor: '1' },
          },
          { kind: 'write', method: 'POST', path: `/api/budgets/${b.id}/archive` },
        ],
        ownerDataIntact: async () => {
          const [view] = await list(owner, '2026-01-31');
          return (
            view?.id === b.id &&
            view.archived === false &&
            view.current?.limitMinor === cop(4_321_987) &&
            view.current.spentMinor === cop(77_777) &&
            mine.accounts.bank.id !== accounts.bank.id
          );
        },
      };
    });
    expect(violations).toEqual([]);
  });

  it("refuses someone else's category exactly like one that doesn't exist", async () => {
    const owner = (await signedInUser(ctx)).client;
    const intruder = (await signedInUser(ctx)).client;
    const { cat } = await spender(owner);
    await spender(intruder);
    const res = await budget(intruder, { categoryId: cat('Educación'), amountMinor: '100' });
    expect([res.status, res.body.error?.code]).toEqual([422, 'budgets.category']);
    expect(await list(owner, '2026-01-31')).toEqual([]);
  });
});
