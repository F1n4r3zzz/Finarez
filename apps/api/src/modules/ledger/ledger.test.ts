import { randomUUID } from 'node:crypto';
import type { AccountView, Category, TransactionView } from '@finanz/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, signedInUser, type TestClient } from '../../test/context';
import { findIsolationViolations } from '../../test/tenant-isolation';

const ctx = createTestContext();
afterAll(() => ctx.close());

type Json = Record<string, unknown>;

/** POST /transactions with an Idempotency-Key (fresh unless given). */
async function post(client: TestClient, draft: unknown, key: string = randomUUID()) {
  const res = await client.request('POST', '/api/ledger/transactions', draft, {
    headers: { 'Idempotency-Key': key },
  });
  return {
    status: res.status,
    body: (await res.json()) as TransactionView & { error?: { code: string } },
  };
}

/** Every request carries a fresh Idempotency-Key; routes that don't need one ignore it. */
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

async function setup() {
  const { client, email } = await signedInUser(ctx);
  const categories = (await json<Category[]>(client, 'GET', '/api/categories')).body;
  const cat = (name: string, kind = 'expense') => {
    const found = categories.find((c) => c.name === name && c.kind === kind);
    if (!found) throw new Error(name);
    return found.id;
  };
  const account = async (body: Json) =>
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
  const nequi = await account({ name: 'Nequi', subtype: 'wallet', currency: 'COP' });
  const visa = await account({
    name: 'Visa',
    subtype: 'credit_card',
    currency: 'COP',
    openingBalanceMinor: '-234000000',
  });
  const wise = await account({
    name: 'Wise',
    subtype: 'bank',
    currency: 'USD',
    openingBalanceMinor: '215000',
  });
  return { client, email, cat, bank, nequi, visa, wise };
}

const day = '2026-03-10';
const lines = (t: TransactionView) =>
  t.entries.map((e) => [e.accountKind, e.currency, e.amountMinor, e.categoryId !== null]).sort();

describe('accounts', () => {
  it('records the opening balance as the first transaction, against hidden equity', async () => {
    const { client, visa } = await setup();
    const list = (
      await json<TransactionView[]>(client, 'GET', `/api/ledger/transactions?accountId=${visa.id}`)
    ).body;
    expect(list).toHaveLength(1);
    expect(list[0]?.kind).toBe('opening');
    expect(lines(list[0] as TransactionView)).toEqual([
      ['equity', 'COP', '234000000', false],
      ['liability', 'COP', '-234000000', false],
    ]);
  });

  it('answers a new account with its real balance (CP2 code #7)', async () => {
    const { client } = await signedInUser(ctx);
    const created = await json<AccountView>(client, 'POST', '/api/ledger/accounts', {
      name: 'Ahorros',
      subtype: 'savings',
      currency: 'COP',
      openedOn: '2025-09-30',
      openingBalanceMinor: '123400',
    });
    expect(created.body.balanceMinor).toBe('123400');
  });

  it('creating an account twice with one key makes one account and one opening balance (CP2 code #1)', async () => {
    const { client } = await signedInUser(ctx);
    const body = {
      name: 'Davivienda',
      subtype: 'bank',
      currency: 'COP',
      openedOn: '2025-09-30',
      openingBalanceMinor: '500000',
    };
    const key = randomUUID();
    const [a, b] = await Promise.all([
      json<AccountView>(client, 'POST', '/api/ledger/accounts', body, key),
      json<AccountView>(client, 'POST', '/api/ledger/accounts', body, key),
    ]);
    expect(a.body.id).toBe(b.body.id);
    expect((await json<AccountView[]>(client, 'GET', '/api/ledger/accounts')).body).toHaveLength(1);
    const openings = (
      await json<TransactionView[]>(
        client,
        'GET',
        `/api/ledger/transactions?accountId=${a.body.id}`,
      )
    ).body;
    expect(openings).toHaveLength(1);
    const noKey = await client.request('POST', '/api/ledger/accounts', body);
    expect(noKey.status).toBe(400);
  });

  it('lists only the user’s own accounts, never the hidden ones', async () => {
    const { client } = await setup();
    const names = (await json<AccountView[]>(client, 'GET', '/api/ledger/accounts')).body.map(
      (a) => a.name,
    );
    expect(names).toEqual(['Bancolombia', 'Nequi', 'Visa', 'Wise']);
  });
});

describe('recording transactions', () => {
  it('split purchase, refund, income, card payment and a cross-currency transfer with its fee', async () => {
    const { client, cat, bank, visa, wise } = await setup();
    const split = await post(client, {
      kind: 'expense',
      occurredOn: day,
      description: 'Éxito',
      accountId: bank.id,
      lines: [
        { categoryId: cat('Mercado'), amountMinor: '22500000' },
        { categoryId: cat('Hogar'), amountMinor: '8500000' },
      ],
    });
    expect(split.status).toBe(201);
    expect(lines(split.body)).toEqual([
      ['asset', 'COP', '-31000000', false],
      ['expense', 'COP', '22500000', true],
      ['expense', 'COP', '8500000', true],
    ]);

    const refund = await post(client, {
      kind: 'expense',
      occurredOn: day,
      description: 'Devolución',
      accountId: bank.id,
      lines: [{ categoryId: cat('Hogar'), amountMinor: '-8500000' }],
    });
    expect(lines(refund.body)).toEqual([
      ['asset', 'COP', '8500000', false],
      ['expense', 'COP', '-8500000', true],
    ]);

    const income = await post(client, {
      kind: 'income',
      occurredOn: day,
      description: 'Client A',
      accountId: bank.id,
      lines: [{ categoryId: cat('Ingresos por servicios', 'income'), amountMinor: '2400000000' }],
    });
    expect(lines(income.body)).toEqual([
      ['asset', 'COP', '2400000000', false],
      ['income', 'COP', '-2400000000', true],
    ]);

    const payment = await post(client, {
      kind: 'transfer',
      occurredOn: day,
      description: 'Pago Visa',
      from: { accountId: bank.id, amountMinor: '234000000' },
      to: { accountId: visa.id, amountMinor: '234000000' },
    });
    expect(lines(payment.body)).toEqual([
      ['asset', 'COP', '-234000000', false],
      ['liability', 'COP', '234000000', false],
    ]);

    const fx = await post(client, {
      kind: 'transfer',
      occurredOn: day,
      description: 'Wise a Bancolombia',
      from: { accountId: wise.id, amountMinor: '100000' },
      to: { accountId: bank.id, amountMinor: '401000000' },
      fee: { amountMinor: '500', categoryId: cat('Comisiones bancarias') },
    });
    expect(lines(fx.body)).toEqual([
      ['asset', 'COP', '401000000', false],
      ['asset', 'USD', '-100500', false],
      ['clearing', 'COP', '-401000000', false],
      ['clearing', 'USD', '100000', false],
      ['expense', 'USD', '500', true],
    ]);
  });

  it('refuses drafts naming another user’s account or category, archived accounts, or mixed-up amounts', async () => {
    const mine = await setup();
    const theirs = await setup();
    const expense = (accountId: string, categoryId: string) => ({
      kind: 'expense',
      occurredOn: day,
      description: 'X',
      accountId,
      lines: [{ categoryId, amountMinor: '100' }],
    });
    expect(
      (await post(mine.client, expense(theirs.bank.id, mine.cat('Mercado')))).body.error?.code,
    ).toBe('ledger.account_not_found');
    expect(
      (await post(mine.client, expense(mine.bank.id, theirs.cat('Mercado')))).body.error?.code,
    ).toBe('ledger.category_not_found');
    await json(mine.client, 'PATCH', `/api/ledger/accounts/${mine.nequi.id}`, { archived: true });
    expect(
      (await post(mine.client, expense(mine.nequi.id, mine.cat('Mercado')))).body.error?.code,
    ).toBe('ledger.account_archived');
    const differ = await post(mine.client, {
      kind: 'transfer',
      occurredOn: day,
      description: 'X',
      from: { accountId: mine.bank.id, amountMinor: '100' },
      to: { accountId: mine.visa.id, amountMinor: '99' },
    });
    expect(differ.status).toBe(422);
    expect(differ.body.error?.code).toBe('ledger.amounts_differ');
    const numberAmount = await post(mine.client, {
      ...expense(mine.bank.id, mine.cat('Mercado')),
      lines: [{ categoryId: mine.cat('Mercado'), amountMinor: 100 }],
    });
    expect(numberAmount.status).toBe(400);
  });
});

describe('idempotency', () => {
  const draft = (accountId: string, categoryId: string) => ({
    kind: 'expense',
    occurredOn: day,
    description: 'Café',
    accountId,
    lines: [{ categoryId, amountMinor: '850000' }],
  });

  it('replays the same answer for the same key and body; refuses a reused key or no key', async () => {
    const { client, cat, bank } = await setup();
    const key = randomUUID();
    const first = await post(client, draft(bank.id, cat('Restaurantes y domicilios')), key);
    const again = await post(client, draft(bank.id, cat('Restaurantes y domicilios')), key);
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    const other = await post(client, draft(bank.id, cat('Mercado')), key);
    expect(other.status).toBe(422);
    expect(other.body.error?.code).toBe('idempotency.key_reused');
    const noKey = await client.request(
      'POST',
      '/api/ledger/transactions',
      draft(bank.id, cat('Mercado')),
    );
    expect(noKey.status).toBe(400);
  });

  it('posts once when the same request arrives twice at the same time', async () => {
    const { client, cat, bank } = await setup();
    const key = randomUUID();
    const body = draft(bank.id, cat('Mercado'));
    const [a, b] = await Promise.all([post(client, body, key), post(client, body, key)]);
    expect(a.body.id).toBe(b.body.id);
    const all = (
      await json<TransactionView[]>(client, 'GET', `/api/ledger/transactions?from=${day}&to=${day}`)
    ).body;
    expect(all).toHaveLength(1);
  });
});

describe('edit, void and restore', () => {
  async function coffee() {
    const s = await setup();
    const created = await post(s.client, {
      kind: 'expense',
      occurredOn: day,
      description: 'Café',
      accountId: s.bank.id,
      lines: [{ categoryId: s.cat('Restaurantes y domicilios'), amountMinor: '850000' }],
    });
    return { ...s, txn: created.body };
  }
  const edit = (
    s: Awaited<ReturnType<typeof coffee>>,
    version: number,
    changes: Json = {},
    extra: Json = {},
  ) =>
    json<TransactionView>(s.client, 'PUT', `/api/ledger/transactions/${s.txn.id}`, {
      version,
      draft: {
        kind: 'expense',
        occurredOn: day,
        description: 'Café',
        accountId: s.bank.id,
        lines: [{ categoryId: s.cat('Restaurantes y domicilios'), amountMinor: '850000' }],
        ...changes,
      },
      ...extra,
    });

  it('edits with the current version only; a stale version is refused', async () => {
    const s = await coffee();
    const edited = await edit(s, 1, {
      lines: [{ categoryId: s.cat('Restaurantes y domicilios'), amountMinor: '900000' }],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.version).toBe(2);
    expect(lines(edited.body)).toEqual([
      ['asset', 'COP', '-900000', false],
      ['expense', 'COP', '900000', true],
    ]);
    expect((await edit(s, 1)).body.error?.code).toBe('ledger.stale_version');
  });

  it('two people editing the same version at once: one wins, the other is told it changed', async () => {
    const s = await coffee();
    const [a, b] = await Promise.all([
      edit(s, 1, { description: 'A' }),
      edit(s, 1, { description: 'B' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('keeps reconciled lines when only the description changes; asks before changing them', async () => {
    const s = await coffee();
    await ctx.db.execute(
      sql`update ledger.entries set reconciled_at = now() where transaction_id = ${s.txn.id} and account_kind = 'asset'`,
    );

    const wording = await edit(s, 1, { description: 'Café con Ana' });
    expect(wording.status).toBe(200);
    expect(wording.body.entries.find((e) => e.accountKind === 'asset')?.reconciled).toBe(true);

    const amount = {
      lines: [{ categoryId: s.cat('Restaurantes y domicilios'), amountMinor: '950000' }],
    };
    expect((await edit(s, 2, amount)).body.error?.code).toBe('ledger.reconciled_change');
    expect((await edit(s, 2, { occurredOn: '2026-03-11' })).body.error?.code).toBe(
      'ledger.reconciled_change',
    );
    const confirmed = await edit(s, 2, amount, { confirmReconciledChange: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.entries.every((e) => !e.reconciled)).toBe(true);
  });

  it('saves a note-only change on a line and keeps it reconciled (CP2 code #5)', async () => {
    const s = await coffee();
    await ctx.db.execute(
      sql`update ledger.entries set reconciled_at = now() where transaction_id = ${s.txn.id}`,
    );
    const lines = (memo: string) => ({
      lines: [{ categoryId: s.cat('Restaurantes y domicilios'), amountMinor: '850000', memo }],
    });
    const res = await edit(s, 1, lines('con Ana'));
    expect(res.status).toBe(200);
    const line = res.body.entries.find((e) => e.categoryId);
    expect(line).toMatchObject({ memo: 'con Ana', reconciled: true });
    const audit = await ctx.db.execute<{ after: { entries: { memo: string | null }[] } }>(
      sql`select after from ledger.transaction_audit where transaction_id = ${s.txn.id} and action = 'update'`,
    );
    expect(audit.rows[0]?.after.entries.map((e) => e.memo)).toContain('con Ana');
  });

  it('void removes the effect but keeps the record; restore brings it back; the history has all of it', async () => {
    const s = await coffee();
    const voided = await json<TransactionView>(
      s.client,
      'POST',
      `/api/ledger/transactions/${s.txn.id}/void`,
      { version: 1 },
    );
    expect(voided.body).toMatchObject({ status: 'void', version: 2, entries: [] });
    expect(
      (await json(s.client, 'POST', `/api/ledger/transactions/${s.txn.id}/void`, { version: 2 }))
        .body.error?.code,
    ).toBe('ledger.already_void');
    const restored = await json<TransactionView>(
      s.client,
      'POST',
      `/api/ledger/transactions/${s.txn.id}/restore`,
      { version: 2 },
    );
    expect(restored.body.status).toBe('posted');
    expect(lines(restored.body)).toEqual(lines(s.txn));

    const history = await ctx.db.execute<{ action: string; version: number }>(
      sql`select action, version from ledger.transaction_audit where transaction_id = ${s.txn.id} order by version`,
    );
    expect(history.rows).toEqual([
      { action: 'create', version: 1 },
      { action: 'void', version: 2 },
      { action: 'restore', version: 3 },
    ]);
  });

  it('a transaction managed by another module can only change through that module', async () => {
    const s = await coffee();
    await ctx.db.execute(
      sql`update ledger.transactions set managed_by = 'debts' where id = ${s.txn.id}`,
    );
    const res = await edit(s, 1, { description: 'Otro' });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('ledger.managed_transaction');
  });
});

describe('ledger: tenant isolation', () => {
  it("never shows or changes another user's accounts or transactions", async () => {
    const violations = await findIsolationViolations(ctx, async (owner) => {
      const categories = (await json<Category[]>(owner, 'GET', '/api/categories')).body;
      const mercado = categories.find((c) => c.name === 'Mercado')?.id;
      const account = (
        await json<AccountView>(owner, 'POST', '/api/ledger/accounts', {
          name: 'Cuenta secreta 8812',
          subtype: 'bank',
          currency: 'COP',
          openedOn: '2025-09-30',
          openingBalanceMinor: '7919331',
        })
      ).body;
      const txn = (
        await post(owner, {
          kind: 'expense',
          occurredOn: day,
          description: 'Compra secreta 4471',
          accountId: account.id,
          lines: [{ categoryId: mercado, amountMinor: '1234567' }],
        })
      ).body;
      return {
        secrets: ['Cuenta secreta 8812', 'Compra secreta 4471', '7919331', '1234567'],
        probes: [
          { kind: 'list', method: 'GET', path: '/api/ledger/accounts', intruderSees: [] },
          { kind: 'list', method: 'GET', path: '/api/ledger/transactions', intruderSees: [] },
          {
            kind: 'list',
            method: 'GET',
            path: `/api/ledger/transactions?accountId=${account.id}`,
            intruderSees: [],
          },
          { kind: 'single', method: 'GET', path: `/api/ledger/transactions/${txn.id}` },
          {
            kind: 'write',
            method: 'PATCH',
            path: `/api/ledger/accounts/${account.id}`,
            body: { archived: true },
          },
          {
            kind: 'write',
            method: 'POST',
            path: `/api/ledger/transactions/${txn.id}/void`,
            body: { version: 1 },
          },
          {
            kind: 'write',
            method: 'PUT',
            path: `/api/ledger/transactions/${txn.id}`,
            body: {
              version: 1,
              draft: {
                kind: 'adjustment',
                occurredOn: day,
                description: 'x',
                accountId: account.id,
                amountMinor: '1',
                categoryId: mercado,
              },
            },
          },
        ],
        ownerDataIntact: async () => {
          const mineNow = (
            await json<TransactionView>(owner, 'GET', `/api/ledger/transactions/${txn.id}`)
          ).body;
          const accounts = (await json<AccountView[]>(owner, 'GET', '/api/ledger/accounts')).body;
          return (
            mineNow.status === 'posted' && mineNow.version === 1 && accounts[0]?.archived === false
          );
        },
      };
    });
    expect(violations).toEqual([]);
  });
});
