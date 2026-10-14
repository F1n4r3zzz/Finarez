import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pgErrorCode, testDatabaseUrl } from '../test/database';
import { createDatabase, type Executor } from './client';

// Two throwaway schemas stand in for two modules (each module owns one schema).
const suffix = `${process.pid}_${Date.now()}`;
const schemaA = sql.identifier(`uow_a_${suffix}`);
const schemaB = sql.identifier(`uow_b_${suffix}`);

const { db, pool } = createDatabase(testDatabaseUrl(), { max: 2 });

// Each "module" writes through whatever executor it is given, never opening its own transaction.
const moduleA = {
  addItem: (tx: Executor, id: number) =>
    tx.execute(sql`insert into ${schemaA}.items (id) values (${id})`),
};
const moduleB = {
  addEntry: (tx: Executor, txn: number, amount: bigint) =>
    tx.execute(sql`insert into ${schemaB}.entries (txn, amount) values (${txn}, ${amount})`),
};

async function countItems(id: number): Promise<number> {
  const result = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from ${schemaA}.items where id = ${id}`,
  );
  return result.rows[0]?.n ?? -1;
}

async function countEntries(txn: number): Promise<number> {
  const result = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from ${schemaB}.entries where txn = ${txn}`,
  );
  return result.rows[0]?.n ?? -1;
}

beforeAll(async () => {
  await db.execute(sql`create schema ${schemaA}`);
  await db.execute(sql`create schema ${schemaB}`);
  await db.execute(sql`create table ${schemaA}.items (id int primary key)`);
  await db.execute(
    sql`create table ${schemaB}.entries (id serial primary key, txn int not null, amount bigint not null)`,
  );
  // Same mechanism the ledger will use: entries of a transaction must sum to zero, checked at commit.
  await db.execute(sql`
    create function ${schemaB}.check_balanced() returns trigger language plpgsql as $$
    begin
      if (select coalesce(sum(amount), 0) from ${schemaB}.entries where txn = new.txn) <> 0 then
        raise exception 'unbalanced transaction %', new.txn using errcode = 'check_violation';
      end if;
      return null;
    end $$`);
  await db.execute(sql`
    create constraint trigger balanced after insert on ${schemaB}.entries
    deferrable initially deferred for each row execute function ${schemaB}.check_balanced()`);
});

afterAll(async () => {
  await db.execute(sql`drop schema ${schemaA} cascade`);
  await db.execute(sql`drop schema ${schemaB} cascade`);
  await pool.end();
});

describe('unit of work across module schemas', () => {
  it('commits writes from two modules together', async () => {
    await db.transaction(async (tx) => {
      await moduleA.addItem(tx, 1);
      await moduleB.addEntry(tx, 1, 100n);
      await moduleB.addEntry(tx, 1, -100n);
    });
    expect(await countItems(1)).toBe(1);
    expect(await countEntries(1)).toBe(2);
  });

  it('rolls back both schemas when a later step fails', async () => {
    await expect(
      db.transaction(async (tx) => {
        await moduleA.addItem(tx, 2);
        await moduleB.addEntry(tx, 2, 50n);
        await moduleB.addEntry(tx, 2, -50n);
        throw new Error('use case failed after writing');
      }),
    ).rejects.toThrow('use case failed after writing');
    expect(await countItems(2)).toBe(0);
    expect(await countEntries(2)).toBe(0);
  });

  it('rolls back everything when a deferred invariant fails at commit', async () => {
    const attempt = db.transaction(async (tx) => {
      await moduleA.addItem(tx, 3);
      await moduleB.addEntry(tx, 3, 100n);
      await moduleB.addEntry(tx, 3, -40n); // unbalanced, but only detected at COMMIT
    });
    const error = await attempt.catch((e: unknown) => e);
    expect(pgErrorCode(error)).toBe('23514'); // check_violation
    expect(await countItems(3)).toBe(0);
    expect(await countEntries(3)).toBe(0);
  });

  it('returns every connection to the pool after commit, rollback and commit failure', async () => {
    await db.transaction(async (tx) => moduleA.addItem(tx, 4));
    await db.transaction(async () => Promise.reject(new Error('rollback'))).catch(() => {});
    await db
      .transaction(async (tx) => {
        await moduleB.addEntry(tx, 5, 1n);
      })
      .catch(() => {});
    expect(pool.waitingCount).toBe(0);
    expect(pool.idleCount).toBe(pool.totalCount);
  });
});
