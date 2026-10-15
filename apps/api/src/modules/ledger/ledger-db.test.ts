import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, type Executor } from '../../db/client';
import { uuidv7 } from '../../platform/ids';
import { testDatabaseUrl } from '../../test/database';

// The ledger's database-level guarantees (data-model §4.3–4.5), tested with plain SQL so no
// application code can hide a gap. Each case is one of the CP2 acceptance scenarios.

const { db, pool } = createDatabase(testDatabaseUrl(), { max: 6 });
afterAll(() => pool.end());

/** The database's own message (Drizzle wraps it as the error's cause). */
async function failure(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    const e = error as Error & { cause?: Error };
    return [e.message, e.cause?.message].filter(Boolean).join(' | ');
  }
  throw new Error('Expected the database to refuse this');
}

async function newUser(): Promise<string> {
  const id = `ledger-test-${randomUUID()}`;
  await db.execute(
    sql`insert into identity.users (id, name, email) values (${id}, '', ${`${id}@example.com`})`,
  );
  return id;
}

type Kind = 'asset' | 'liability' | 'income' | 'expense' | 'equity' | 'clearing';
const ROLE_FOR: Partial<Record<Kind, string>> = {
  income: 'income',
  expense: 'expense',
  clearing: 'fx',
};

async function account(
  user: string,
  kind: Kind,
  currency = 'COP',
  subtype: string | null = kind === 'asset' ? 'bank' : kind === 'liability' ? 'credit_card' : null,
): Promise<{ id: string; kind: Kind; currency: string }> {
  const id = uuidv7();
  const role = ROLE_FOR[kind] ?? (kind === 'equity' ? 'opening_balance' : null);
  await db.execute(sql`insert into ledger.accounts (user_id, id, kind, subtype, currency, name, opened_on, system_role)
    values (${user}, ${id}, ${kind}, ${subtype}, ${currency}, ${`Cuenta ${kind}`}, '2026-01-01', ${role})`);
  return { id, kind, currency };
}

async function category(user: string, kind: 'income' | 'expense'): Promise<string> {
  const id = uuidv7();
  await db.execute(sql`insert into categories.categories (user_id, id, kind, name)
    values (${user}, ${id}, ${kind}, ${`Cat ${id.slice(-6)}`})`);
  return id;
}

const header = (tx: Executor, user: string, id: string, status = 'posted', on = '2026-01-10') =>
  tx.execute(sql`insert into ledger.transactions (user_id, id, occurred_on, kind, status, description)
    values (${user}, ${id}, ${on}, 'expense', ${status}, 'Prueba')`);

interface Line {
  account: { id: string; kind: Kind; currency: string };
  amount: bigint;
  categoryId?: string | null;
  categoryKind?: string | null;
  id?: string;
}

const line = (tx: Executor, user: string, txnId: string, l: Line, on = '2026-01-10') => {
  const categoryKind =
    l.categoryKind !== undefined ? l.categoryKind : l.categoryId ? l.account.kind : null;
  return tx.execute(sql`insert into ledger.entries
      (user_id, id, transaction_id, occurred_on, account_id, account_kind, currency, amount_minor, category_id, category_kind)
    values (${user}, ${l.id ?? uuidv7()}, ${txnId}, ${on}, ${l.account.id}, ${l.account.kind},
      ${l.account.currency}, ${l.amount}, ${l.categoryId ?? null}, ${categoryKind})`);
};

/** A user with a bank, a card, an expense account and a category, all in COP. */
async function setup() {
  const user = await newUser();
  const bank = await account(user, 'asset');
  const card = await account(user, 'liability');
  const expense = await account(user, 'expense');
  const food = await category(user, 'expense');
  return { user, bank, card, expense, food };
}

async function post(user: string, lines: Line[], status = 'posted'): Promise<string> {
  const id = uuidv7();
  await db.transaction(async (tx) => {
    await header(tx, user, id, status);
    for (const l of lines) await line(tx, user, id, l);
  });
  return id;
}

describe('posting invariant (checked at COMMIT)', () => {
  it('accepts a balanced posting', async () => {
    const { user, bank, expense, food } = await setup();
    await expect(
      post(user, [
        { account: bank, amount: -50_000_00n },
        { account: expense, amount: 50_000_00n, categoryId: food },
      ]),
    ).resolves.toBeTypeOf('string');
  });

  it('refuses a posted transaction with no entries, or only one', async () => {
    const { user, bank } = await setup();
    expect(await failure(post(user, []))).toMatch(/at least two entries/);
    expect(await failure(post(user, [{ account: bank, amount: 1n }]))).toMatch(/at least two/);
  });

  it('refuses entries that do not add up to zero', async () => {
    const { user, bank, expense, food } = await setup();
    expect(
      await failure(
        post(user, [
          { account: bank, amount: -50_000_00n },
          { account: expense, amount: 49_999_00n, categoryId: food },
        ]),
      ),
    ).toMatch(/does not balance in COP/);
  });

  it('balances each currency separately (a cross-currency transfer through FX clearing)', async () => {
    const user = await newUser();
    const wise = await account(user, 'asset', 'USD');
    const bank = await account(user, 'asset', 'COP');
    const fxUsd = await account(user, 'clearing', 'USD');
    const fxCop = await account(user, 'clearing', 'COP');
    await expect(
      post(user, [
        { account: wise, amount: -1_000_00n },
        { account: fxUsd, amount: 1_000_00n },
        { account: fxCop, amount: -4_010_000_00n },
        { account: bank, amount: 4_010_000_00n },
      ]),
    ).resolves.toBeTypeOf('string');
    expect(
      await failure(
        post(user, [
          { account: wise, amount: -1_000_00n },
          { account: fxCop, amount: -4_010_000_00n },
          { account: bank, amount: 4_010_000_00n },
        ]),
      ),
    ).toMatch(/does not balance in USD/);
  });

  it('a void transaction has no entries', async () => {
    const { user, bank, expense, food } = await setup();
    await expect(post(user, [], 'void')).resolves.toBeTypeOf('string');
    expect(
      await failure(
        post(
          user,
          [
            { account: bank, amount: -1n },
            { account: expense, amount: 1n, categoryId: food },
          ],
          'void',
        ),
      ),
    ).toMatch(/void transaction .* still has entries/);
  });

  it('re-checks both transactions when an entry moves from one to the other', async () => {
    const { user, bank, card, expense, food } = await setup();
    const first = await post(user, [
      { account: bank, amount: -10n },
      { account: expense, amount: 10n, categoryId: food },
    ]);
    const second = await post(user, [
      { account: card, amount: -10n },
      { account: expense, amount: 10n, categoryId: food },
    ]);
    expect(
      await failure(
        db.execute(
          sql`update ledger.entries set transaction_id = ${second} where transaction_id = ${first} and account_kind = 'asset'`,
        ),
      ),
    ).toMatch(/(at least two entries|does not balance)/);
  });

  it('two sessions removing different balanced pairs of one transaction: the second waits, then fails', async () => {
    const { user, bank, card, expense, food } = await setup();
    const first = { account: bank, amount: -100n, id: uuidv7() };
    const firstCat = { account: expense, amount: 100n, categoryId: food, id: uuidv7() };
    const second = { account: card, amount: -200n, id: uuidv7() };
    const secondCat = { account: await account(user, 'income'), amount: 200n, id: uuidv7() };
    const salary = await category(user, 'income');
    const txnId = await post(user, [first, firstCat, second, { ...secondCat, categoryId: salary }]);

    const one = await pool.connect();
    const two = await pool.connect();
    try {
      await one.query('begin');
      await one.query('delete from ledger.entries where id = any($1)', [[first.id, firstCat.id]]);
      await two.query('begin');
      const waiting = two
        .query('delete from ledger.entries where id = any($1)', [[second.id, secondCat.id]])
        .then(() => two.query('commit'));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await one.query('commit');
      expect(await failure(waiting)).toMatch(/at least two entries/);
    } finally {
      await two.query('rollback').catch(() => {});
      one.release();
      two.release();
    }
    const left = await db.execute(
      sql`select count(*)::int as n from ledger.entries where transaction_id = ${txnId}`,
    );
    expect(left.rows[0]).toEqual({ n: 2 });
  });
});

describe('what an entry can point at', () => {
  it("must be in its account's currency and kind", async () => {
    const { user, bank, expense, food } = await setup();
    expect(
      await failure(
        post(user, [
          { account: { ...bank, currency: 'USD' }, amount: -1n },
          { account: expense, amount: 1n, categoryId: food },
        ]),
      ),
    ).toMatch(/entries_account_fk/);
    expect(
      await failure(
        post(user, [
          { account: { ...bank, kind: 'liability' }, amount: -1n },
          { account: expense, amount: 1n, categoryId: food },
        ]),
      ),
    ).toMatch(/entries_account_fk/);
  });

  it('can never reference another user', async () => {
    const mine = await setup();
    const theirs = await setup();
    expect(
      await failure(
        post(mine.user, [
          { account: theirs.bank, amount: -1n },
          { account: mine.expense, amount: 1n, categoryId: mine.food },
        ]),
      ),
    ).toMatch(/entries_account_fk/);
    expect(
      await failure(
        post(mine.user, [
          { account: mine.bank, amount: -1n },
          { account: mine.expense, amount: 1n, categoryId: theirs.food },
        ]),
      ),
    ).toMatch(/entries_category_fk/);
  });

  it('category rules: required on income/expense lines only, of the same kind, and never half-set', async () => {
    const { user, bank, expense, food } = await setup();
    const salary = await category(user, 'income');
    const cases: [Line[], RegExp][] = [
      // The CP2 #1 bypass: category id set, its kind left empty.
      [
        [
          { account: bank, amount: -1n },
          { account: expense, amount: 1n, categoryId: food, categoryKind: null },
        ],
        /entries_category_pair/,
      ],
      [
        [
          { account: bank, amount: -1n },
          { account: expense, amount: 1n },
        ],
        /entries_category_required/,
      ],
      [
        [
          { account: bank, amount: -1n, categoryId: food, categoryKind: 'expense' },
          { account: expense, amount: 1n, categoryId: food },
        ],
        /entries_category/,
      ],
      [
        [
          { account: bank, amount: -1n },
          { account: expense, amount: 1n, categoryId: salary, categoryKind: 'income' },
        ],
        /entries_category_kind/,
      ],
    ];
    for (const [lines, error] of cases) expect(await failure(post(user, lines))).toMatch(error);
  });

  it('moves each user account once per transaction (one statement row, one leg)', async () => {
    const { user, bank, expense, food } = await setup();
    expect(
      await failure(
        post(user, [
          { account: bank, amount: -1_000n },
          { account: bank, amount: -5n },
          { account: expense, amount: 1_005n, categoryId: food },
        ]),
      ),
    ).toMatch(/entries_one_leg_per_account/);
  });

  it('rejects zero amounts', async () => {
    const { user, bank, expense, food } = await setup();
    expect(
      await failure(
        post(user, [
          { account: bank, amount: 0n },
          { account: expense, amount: 0n, categoryId: food },
        ]),
      ),
    ).toMatch(/entries_amount/);
  });
});

describe('dates, accounts and history', () => {
  it("an entry's date always follows its transaction's", async () => {
    const { user, bank, expense, food } = await setup();
    const id = await post(user, [
      { account: bank, amount: -1n },
      { account: expense, amount: 1n, categoryId: food },
    ]);
    await db.execute(
      sql`update ledger.transactions set occurred_on = '2026-02-01' where id = ${id}`,
    );
    const dates = await db.execute<{ d: string }>(
      sql`select distinct occurred_on::text as d from ledger.entries where transaction_id = ${id}`,
    );
    expect(dates.rows).toEqual([{ d: '2026-02-01' }]);
  });

  it("an account's currency and kind are frozen once it has entries", async () => {
    const { user, bank, expense, food } = await setup();
    await post(user, [
      { account: bank, amount: -1n },
      { account: expense, amount: 1n, categoryId: food },
    ]);
    expect(
      await failure(
        db.execute(sql`update ledger.accounts set currency = 'USD' where id = ${bank.id}`),
      ),
    ).toMatch(/entries_account_fk/);
  });

  it('account shapes: asset and liability subtypes, system accounts once per role and currency', async () => {
    const user = await newUser();
    expect(await failure(account(user, 'asset', 'COP', 'loan'))).toMatch(/accounts_kind_shape/);
    expect(await failure(account(user, 'liability', 'COP', 'bank'))).toMatch(/accounts_kind_shape/);
    await account(user, 'expense', 'COP');
    expect(await failure(account(user, 'expense', 'COP'))).toMatch(/accounts_system_role/);
    await expect(account(user, 'expense', 'USD')).resolves.toBeDefined();
  });

  it('history is append-only, transactions are never deleted, and both go with their owner', async () => {
    const { user, bank, expense, food } = await setup();
    const id = await post(user, [
      { account: bank, amount: -1n },
      { account: expense, amount: 1n, categoryId: food },
    ]);
    await db.execute(sql`insert into ledger.transaction_audit (user_id, id, transaction_id, version, action, source, actor_user_id)
      values (${user}, ${uuidv7()}, ${id}, 1, 'create', 'ui', ${user})`);
    expect(
      await failure(
        db.execute(sql`update ledger.transaction_audit set version = 2 where user_id = ${user}`),
      ),
    ).toMatch(/never updated/);
    expect(
      await failure(db.execute(sql`delete from ledger.transaction_audit where user_id = ${user}`)),
    ).toMatch(/never deleted/);
    expect(
      await failure(db.execute(sql`delete from ledger.entries where transaction_id = ${id}`)),
    ).toMatch(/at least two entries/);
    expect(
      await failure(db.execute(sql`delete from ledger.transactions where id = ${id}`)),
    ).toMatch(/./);

    await db.execute(sql`delete from identity.users where id = ${user}`);
    for (const table of ['accounts', 'transactions', 'entries', 'transaction_audit']) {
      const left = await db.execute(
        sql`select count(*)::int as n from ${sql.identifier('ledger')}.${sql.identifier(table)} where user_id = ${user}`,
      );
      expect(left.rows[0]).toEqual({ n: 0 });
    }
  });
});
