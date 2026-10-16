import { randomUUID } from 'node:crypto';
import type {
  AccountView,
  Category,
  OccurrenceView,
  RuleView,
  RunResult,
  TransactionView,
} from '@finanz/contracts';
import { type LocalDate, nextOccurrence, todayIn } from '@finanz/kernel';
import { sql } from 'drizzle-orm';
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
const today = () => todayIn('America/Bogota');
const daysFrom = (date: LocalDate, days: number) => {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10) as LocalDate;
};

/** A user with a COP bank and savings account and the default categories. */
async function payer(client: TestClient) {
  await json(client, 'PUT', '/api/me/preferences', {
    language: 'es',
    timeZone: 'America/Bogota',
    primaryCurrency: 'COP',
  });
  const categories = (await json<Category[]>(client, 'GET', '/api/categories')).body;
  const cat = (name: string, kind = 'expense') => {
    const found = categories.find((c) => c.name === name && c.kind === kind);
    if (!found) throw new Error(`No category ${name}`);
    return found.id;
  };
  const account = async (name: string, subtype: string) =>
    (
      await json<AccountView>(client, 'POST', '/api/ledger/accounts', {
        name,
        subtype,
        currency: 'COP',
        openedOn: '2025-01-01',
        openingBalanceMinor: cop(10_000_000),
      })
    ).body;
  return {
    cat,
    bank: await account('Bancolombia', 'bank'),
    savings: await account('Ahorros', 'savings'),
  };
}

type Payer = Awaited<ReturnType<typeof payer>>;

const expense = (p: Payer, occurredOn: LocalDate, amount = cop(1_500_000)) => ({
  kind: 'expense',
  occurredOn,
  description: 'Arriendo',
  accountId: p.bank.id,
  lines: [{ categoryId: p.cat('Arriendo'), amountMinor: amount }],
});

const rule = (client: TestClient, body: Record<string, unknown>, key?: string) =>
  json<RuleView>(client, 'POST', '/api/recurring/rules', body, key);

/** What the user recorded, leaving out the accounts' opening balances. */
const transactions = async (client: TestClient) =>
  (await json<TransactionView[]>(client, 'GET', '/api/ledger/transactions')).body.filter(
    (t) => t.kind !== 'opening',
  );

const run = async (client: TestClient) =>
  (await json<RunResult>(client, 'POST', '/api/recurring/run')).body;

const history = async (client: TestClient, id: string) =>
  (await json<OccurrenceView[]>(client, 'GET', `/api/recurring/rules/${id}/occurrences`)).body;

/** As if the app hadn't been opened since `date`: the rule became due then. */
async function dueSince(id: string, date: LocalDate) {
  await ctx.db.execute(
    sql`update recurring.rules set next_due_on = ${date}, anchor_on = ${date} where id = ${id}`,
  );
}

describe('recurring rules', () => {
  it('record the first movement now and continue after today', async () => {
    const { client } = await signedInUser(ctx);
    const p = await payer(client);
    const now = today();
    const created = await rule(client, { draft: expense(p, now), frequency: 'monthly' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      frequency: 'monthly',
      anchorOn: now,
      nextDueOn: nextOccurrence({ frequency: 'monthly', anchor: now }, now),
      confirm: false,
      ended: false,
      pending: 0,
      amountMinor: cop(1_500_000),
      currency: 'COP',
    });
    expect((await transactions(client)).map((t) => t.description)).toEqual(['Arriendo']);
    expect((await history(client, created.body.id)).map((o) => [o.dueOn, o.status])).toEqual([
      [now, 'posted'],
    ]);
  });

  it('leave the dates between a back-dated movement and today alone, and wait for a future one', async () => {
    const { client } = await signedInUser(ctx);
    const p = await payer(client);
    const back = await rule(client, {
      draft: expense(p, daysFrom(today(), -21)),
      frequency: 'weekly',
    });
    expect(back.body.nextDueOn > today()).toBe(true);
    const later = daysFrom(today(), 10);
    const future = await rule(client, { draft: expense(p, later), frequency: 'yearly' });
    expect(future.body.nextDueOn).toBe(later);
    expect(await transactions(client)).toHaveLength(1);
    expect(await run(client)).toEqual({ posted: 0, pending: 0 });
  });

  it('record every due date exactly once, even when two runs race', async () => {
    const { client } = await signedInUser(ctx);
    const p = await payer(client);
    const r = (await rule(client, { draft: expense(p, today()), frequency: 'weekly' })).body;
    await dueSince(r.id, daysFrom(today(), -21));
    const results = await Promise.all([run(client), run(client), run(client)]);
    // Three weeks back, two weeks back, last week; today's was recorded when it was created.
    expect(results.reduce((n, x) => n + x.posted, 0)).toBe(3);
    const posted = await transactions(client);
    expect(posted.map((t) => t.occurredOn).sort()).toEqual(
      [-21, -14, -7, 0].map((d) => daysFrom(today(), d)),
    );
    expect(
      (await json<RuleView>(client, 'GET', `/api/recurring/rules/${r.id}`)).body.nextDueOn,
    ).toBe(daysFrom(today(), 7));
    expect(await run(client)).toEqual({ posted: 0, pending: 0 });
  });

  it('wait for confirmation when asked; confirming can change amount and date, and a skip stays', async () => {
    const { client } = await signedInUser(ctx);
    const p = await payer(client);
    const r = (
      await rule(client, {
        draft: { ...expense(p, today()), description: 'Luz' },
        frequency: 'weekly',
        confirm: true,
      })
    ).body;
    await dueSince(r.id, daysFrom(today(), -14));
    expect(await run(client)).toEqual({ posted: 0, pending: 2 });
    const pending = (await json<OccurrenceView[]>(client, 'GET', '/api/recurring/pending')).body;
    expect(pending.map((o) => [o.dueOn, o.description, o.amountMinor])).toEqual([
      [daysFrom(today(), -14), 'Luz', cop(1_500_000)],
      [daysFrom(today(), -7), 'Luz', cop(1_500_000)],
    ]);
    const [first, second] = pending as [OccurrenceView, OccurrenceView];
    const paid = daysFrom(today(), -12);
    const confirm = await json(
      client,
      'POST',
      `/api/recurring/rules/${r.id}/occurrences/${first.dueOn}/confirm`,
      { amountMinor: cop(162_400), occurredOn: paid },
    );
    expect(confirm.status).toBe(200);
    const again = await json(
      client,
      'POST',
      `/api/recurring/rules/${r.id}/occurrences/${first.dueOn}/confirm`,
      {},
    );
    expect([again.status, again.body.error?.code]).toEqual([409, 'recurring.not_pending']);
    await json(client, 'POST', `/api/recurring/rules/${r.id}/occurrences/${second.dueOn}/skip`);

    expect(await run(client)).toEqual({ posted: 0, pending: 0 });
    const luz = (await transactions(client)).filter((t) => t.occurredOn === paid);
    expect(luz.map((t) => t.entries.find((e) => e.categoryId)?.amountMinor)).toEqual([
      cop(162_400),
    ]);
    expect((await history(client, r.id)).map((o) => [o.dueOn, o.status])).toEqual([
      [today(), 'posted'],
      [second.dueOn, 'skipped'],
      [first.dueOn, 'posted'],
    ]);
  });

  it('take a long absence a part at a time, also when each date waits for the user', async () => {
    const { client } = await signedInUser(ctx);
    const p = await payer(client);
    const r = (
      await rule(client, { draft: expense(p, today()), frequency: 'weekly', confirm: true })
    ).body;
    // 250 weeks unopened: more dates than one run takes.
    await dueSince(r.id, daysFrom(today(), -7 * 250));
    expect(await run(client)).toEqual({ posted: 0, pending: 200 });
    expect(
      (await json<RuleView>(client, 'GET', `/api/recurring/rules/${r.id}`)).body.nextDueOn,
    ).toBe(daysFrom(today(), -7 * 50));
    expect(await run(client)).toEqual({ posted: 0, pending: 250 });
    expect(
      (await json<RuleView>(client, 'GET', `/api/recurring/rules/${r.id}`)).body.nextDueOn,
    ).toBe(daysFrom(today(), 7));
  });

  it('keep an automatic one the ledger refuses waiting, with the reason', async () => {
    const { client } = await signedInUser(ctx);
    const p = await payer(client);
    const r = (await rule(client, { draft: expense(p, today()), frequency: 'weekly' })).body;
    await json(client, 'PATCH', `/api/ledger/accounts/${p.bank.id}`, { archived: true });
    await dueSince(r.id, daysFrom(today(), -7));
    expect(await run(client)).toEqual({ posted: 0, pending: 1 });
    const [waiting] = (await json<OccurrenceView[]>(client, 'GET', '/api/recurring/pending')).body;
    expect(waiting?.error).toBe('ledger.account_archived');

    await json(client, 'PATCH', `/api/ledger/accounts/${p.bank.id}`, { archived: false });
    const ok = await json(
      client,
      'POST',
      `/api/recurring/rules/${r.id}/occurrences/${waiting?.dueOn}/confirm`,
      {},
    );
    expect(ok.status).toBe(200);
    expect(await transactions(client)).toHaveLength(2);
  });

  it('skip the next date ahead of time, and stop when ended', async () => {
    const { client } = await signedInUser(ctx);
    const p = await payer(client);
    const r = (await rule(client, { draft: expense(p, today()), frequency: 'weekly' })).body;
    const skipped = await json<RuleView>(client, 'POST', `/api/recurring/rules/${r.id}/skip-next`);
    expect(skipped.body.nextDueOn).toBe(daysFrom(today(), 14));
    expect((await history(client, r.id))[0]).toMatchObject({
      dueOn: daysFrom(today(), 7),
      status: 'skipped',
    });

    const ended = await json<RuleView>(client, 'POST', `/api/recurring/rules/${r.id}/end`);
    expect(ended.body.ended).toBe(true);
    await dueSince(r.id, daysFrom(today(), -7));
    expect(await run(client)).toEqual({ posted: 0, pending: 0 });
    for (const [method, path, body] of [
      ['PATCH', `/api/recurring/rules/${r.id}`, { confirm: true }],
      ['POST', `/api/recurring/rules/${r.id}/skip-next`, undefined],
    ] as const) {
      const res = await json(client, method, path, body);
      expect([res.status, res.body.error?.code]).toEqual([422, 'recurring.ended']);
    }
  });

  it('change the amount and schedule from the next date on, never in the past', async () => {
    const { client } = await signedInUser(ctx);
    const p = await payer(client);
    const r = (await rule(client, { draft: expense(p, today()), frequency: 'monthly' })).body;
    const next = daysFrom(today(), 3);
    const secondDay = Number(next.slice(8, 10)) === 30 ? 15 : 30;
    const changed = await json<RuleView>(client, 'PATCH', `/api/recurring/rules/${r.id}`, {
      amountMinor: cop(1_600_000),
      frequency: 'twice_monthly',
      secondDay,
      nextDueOn: next,
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      amountMinor: cop(1_600_000),
      frequency: 'twice_monthly',
      secondDay,
      anchorOn: next,
      nextDueOn: next,
    });
    const refusals = [
      [{ nextDueOn: daysFrom(today(), -1) }, 'recurring.next_in_past'],
      [{ secondDay: Number(next.slice(8, 10)) }, 'recurring.second_day'],
      [{ endsOn: daysFrom(next, -1) }, 'recurring.ends_before_next'],
    ] as const;
    for (const [body, code] of refusals) {
      const res = await json(client, 'PATCH', `/api/recurring/rules/${r.id}`, body);
      expect([res.status, res.body.error?.code]).toEqual([422, code]);
    }

    const split = (
      await rule(client, {
        draft: {
          ...expense(p, today()),
          lines: [
            { categoryId: p.cat('Mercado'), amountMinor: cop(300_000) },
            { categoryId: p.cat('Hogar'), amountMinor: cop(80_000) },
          ],
        },
        frequency: 'monthly',
      })
    ).body;
    expect(split.amountMinor).toBeNull();
    const res = await json(client, 'PATCH', `/api/recurring/rules/${split.id}`, {
      amountMinor: '100',
    });
    expect([res.status, res.body.error?.code]).toEqual([422, 'recurring.amount_not_adjustable']);
  });

  it('take only income, expenses and transfers the user could record, once per key', async () => {
    const { client } = await signedInUser(ctx);
    const p = await payer(client);
    const adjustment = await rule(client, {
      draft: {
        kind: 'adjustment',
        occurredOn: today(),
        description: 'Ajuste',
        accountId: p.bank.id,
        amountMinor: '100',
        categoryId: p.cat('Mercado'),
      },
      frequency: 'monthly',
    });
    expect(adjustment.status).toBe(400);
    const noSecondDay = await rule(client, {
      draft: expense(p, today()),
      frequency: 'twice_monthly',
    });
    expect(noSecondDay.status).toBe(400);
    const unknown = await rule(client, {
      draft: { ...expense(p, today()), accountId: randomUUID() },
      frequency: 'monthly',
    });
    expect([unknown.status, unknown.body.error?.code]).toEqual([422, 'ledger.account_not_found']);

    const transfer = await rule(client, {
      draft: {
        kind: 'transfer',
        occurredOn: daysFrom(today(), 5),
        description: 'Ahorro del mes',
        from: { accountId: p.bank.id, amountMinor: cop(500_000) },
        to: { accountId: p.savings.id, amountMinor: cop(500_000) },
      },
      frequency: 'monthly',
    });
    expect(transfer.body).toMatchObject({ amountMinor: cop(500_000), currency: 'COP' });

    const key = randomUUID();
    const once = await rule(client, { draft: expense(p, today()), frequency: 'monthly' }, key);
    const twice = await rule(client, { draft: expense(p, today()), frequency: 'monthly' }, key);
    expect(twice.body.id).toBe(once.body.id);
    expect(await transactions(client)).toHaveLength(1);
  });
});

describe('recurring: tenant isolation', () => {
  it("never shows, runs or changes another user's rules", async () => {
    const violations = await findIsolationViolations(ctx, async (owner, intruder) => {
      const p = await payer(owner);
      const r = (
        await rule(owner, {
          draft: { ...expense(p, today(), cop(4_321_987)), description: 'Secreto 8812' },
          frequency: 'weekly',
          confirm: true,
        })
      ).body;
      await dueSince(r.id, daysFrom(today(), -7));
      await run(owner);
      const due = daysFrom(today(), -7);
      await payer(intruder);
      const base = `/api/recurring/rules/${r.id}`;
      return {
        secrets: ['Secreto 8812', cop(4_321_987)],
        probes: [
          { kind: 'list', method: 'GET', path: '/api/recurring/rules', intruderSees: [] },
          { kind: 'list', method: 'GET', path: '/api/recurring/pending', intruderSees: [] },
          {
            kind: 'aggregate',
            method: 'POST',
            path: '/api/recurring/run',
            intruderSees: { posted: 0, pending: 0 },
          },
          { kind: 'single', method: 'GET', path: base },
          { kind: 'nested', method: 'GET', path: `${base}/occurrences` },
          { kind: 'write', method: 'PATCH', path: base, body: { confirm: false } },
          { kind: 'write', method: 'POST', path: `${base}/skip-next` },
          { kind: 'write', method: 'POST', path: `${base}/end` },
          { kind: 'write', method: 'POST', path: `${base}/occurrences/${due}/confirm`, body: {} },
          { kind: 'write', method: 'POST', path: `${base}/occurrences/${due}/skip` },
        ],
        ownerDataIntact: async () => {
          const [view] = (await json<RuleView[]>(owner, 'GET', '/api/recurring/rules')).body;
          const pending = (await json<OccurrenceView[]>(owner, 'GET', '/api/recurring/pending'))
            .body;
          return (
            view?.id === r.id &&
            !view.ended &&
            view.confirm &&
            pending.length === 1 &&
            pending[0]?.status === 'pending'
          );
        },
      };
    });
    expect(violations).toEqual([]);
  });
});
