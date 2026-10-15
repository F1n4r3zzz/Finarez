import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../test/database';
import { createDatabase } from './client';
import { inSnapshot } from './unit-of-work';

const table = sql.identifier(`snapshot_probe_${process.pid}`);
const { db, pool } = createDatabase(testDatabaseUrl(), { max: 2 });

beforeAll(() => db.execute(sql`create table ${table} (n int)`));
afterAll(async () => {
  await db.execute(sql`drop table ${table}`);
  await pool.end();
});

const count = async (tx: typeof db) =>
  Number(
    (await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${table}`)).rows[0]?.n,
  );

describe('inSnapshot', () => {
  it('sees the same data in every read, even when another session commits in between', async () => {
    const seen = await inSnapshot(db, async (tx) => {
      const before = await count(tx as typeof db);
      await db.execute(sql`insert into ${table} values (1)`); // another connection, committed
      return [before, await count(tx as typeof db)];
    });
    expect(seen[0]).toBe(seen[1]);
    expect(await count(db)).toBe((seen[0] ?? 0) + 1);
  });

  it('refuses to write', async () => {
    await expect(
      inSnapshot(db, (tx) => tx.execute(sql`insert into ${table} values (2)`)),
    ).rejects.toThrow();
  });
});
