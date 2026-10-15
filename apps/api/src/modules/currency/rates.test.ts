import { CURRENCY_CODES, minorUnits } from '@finanz/kernel';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, signedInUser, type TestClient } from '../../test/context';
import { findIsolationViolations } from '../../test/tenant-isolation';
import { loadRateBook } from './application/rates';

const ctx = createTestContext();
afterAll(() => ctx.close());

const USD_COP = { base: 'USD', quote: 'COP', validFrom: '2026-01-01', rate: '4012.500000' };

async function addRate(client: TestClient, body: unknown = USD_COP) {
  const res = await client.request('POST', '/api/currency/rates', body);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function userId(client: TestClient): Promise<string> {
  const session = (await (await client.request('GET', '/api/auth/get-session')).json()) as {
    user: { id: string };
  };
  return session.user.id;
}

describe('currencies', () => {
  it('lists the same currencies and minor units as the kernel', async () => {
    const { client } = await signedInUser(ctx);
    const res = await client.request('GET', '/api/currency/currencies');
    expect(await res.json()).toEqual(
      [...CURRENCY_CODES].sort().map((code) => ({ code, minorUnits: minorUnits(code) })),
    );
    const rows = await ctx.db.execute<{ code: string; minor_units: number }>(
      sql`select code, minor_units from currency.currencies order by code`,
    );
    expect(rows.rows).toEqual(
      [...CURRENCY_CODES].sort().map((code) => ({ code, minor_units: minorUnits(code) })),
    );
  });
});

describe('user exchange rates', () => {
  it('stores an exact rate and returns it in canonical form', async () => {
    const { client } = await signedInUser(ctx);
    const created = await addRate(client);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ base: 'USD', quote: 'COP', rate: '4012.5' });
    const list = await (await client.request('GET', '/api/currency/rates')).json();
    expect(list).toEqual([created.body]);
  });

  it.each([
    [{ ...USD_COP, quote: 'USD' }, 'quote'],
    [{ ...USD_COP, rate: '0' }, 'rate'],
    [{ ...USD_COP, rate: '-4000' }, 'rate'],
    [{ ...USD_COP, rate: '4,000.5' }, 'rate'],
    [{ ...USD_COP, rate: 4000 }, 'rate'],
    [{ ...USD_COP, validFrom: '2026-02-30' }, 'validFrom'],
    [{ ...USD_COP, base: 'BTC' }, 'base'],
  ])('rejects %j', async (body, field) => {
    const { client } = await signedInUser(ctx);
    const res = await addRate(client, body);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(`"path":"${field}"`);
  });

  it('corrects a rate with a revision; the old value stays on record but is no longer used', async () => {
    const { client } = await signedInUser(ctx);
    const { body: first } = await addRate(client);
    const revised = await client.request('POST', `/api/currency/rates/${first.id}/revisions`, {
      validFrom: '2026-01-01',
      rate: '4015',
    });
    expect(revised.status).toBe(201);
    const second = (await revised.json()) as Record<string, unknown>;
    expect(second).toMatchObject({
      base: 'USD',
      quote: 'COP',
      rate: '4015',
      supersedesId: first.id,
    });
    expect(await (await client.request('GET', '/api/currency/rates')).json()).toEqual([second]);

    // The superseded row can't be corrected again: correct the newest one.
    const again = await client.request('POST', `/api/currency/rates/${first.id}/revisions`, {
      validFrom: '2026-01-01',
      rate: '4020',
    });
    expect(again.status).toBe(409);
  });

  it('answers 404 for unknown or malformed rate ids', async () => {
    const { client } = await signedInUser(ctx);
    for (const id of ['01900000-0000-7000-8000-000000000000', 'not-a-uuid']) {
      const res = await client.request('POST', `/api/currency/rates/${id}/revisions`, {
        validFrom: '2026-01-01',
        rate: '1',
      });
      expect(res.status).toBe(404);
    }
  });

  it('feeds the rate book used for conversions (current revisions only)', async () => {
    const { client } = await signedInUser(ctx);
    const { body: first } = await addRate(client);
    await client.request('POST', `/api/currency/rates/${first.id}/revisions`, {
      validFrom: '2026-01-01',
      rate: '4015',
    });
    const book = await loadRateBook(ctx.db, await userId(client));
    const quote = book.find('USD', 'COP', '2026-03-01' as never);
    expect(quote?.legs.map((l) => l.rateId)).not.toContain(first.id);
    expect(quote?.rate).toEqual({ coefficient: 4015n, scale: 0 });
  });
});

describe('rate rows in the database', () => {
  it('can be neither changed nor deleted, and a revision must keep its pair', async () => {
    const { client } = await signedInUser(ctx);
    const { body } = await addRate(client);
    const id = body.id as string;
    const owner = await userId(client);

    await expect(
      ctx.db.execute(sql`update currency.user_rates set rate = 1 where id = ${id}`),
    ).rejects.toThrow();
    await expect(
      ctx.db.execute(sql`delete from currency.user_rates where id = ${id}`),
    ).rejects.toThrow();
    await expect(
      ctx.db.execute(sql`insert into currency.user_rates (user_id, id, base, quote, valid_from, rate, supersedes_id)
        values (${owner}, gen_random_uuid(), 'USD', 'MXN', '2026-01-01', 18, ${id})`),
    ).rejects.toThrow();
  });

  it('disappear with their owner', async () => {
    const { client } = await signedInUser(ctx);
    await addRate(client);
    const owner = await userId(client);
    await ctx.db.execute(sql`delete from identity.users where id = ${owner}`);
    const left = await ctx.db.execute(
      sql`select 1 from currency.user_rates where user_id = ${owner}`,
    );
    expect(left.rows).toHaveLength(0);
  });
});

describe('currency: tenant isolation', () => {
  it("never shows or corrects another user's rates", async () => {
    const violations = await findIsolationViolations(ctx, async (owner) => {
      const { body } = await addRate(owner, { ...USD_COP, rate: '4777.123', note: 'Secreto' });
      return {
        secrets: ['4777.123', 'Secreto'],
        probes: [
          { kind: 'list', method: 'GET', path: '/api/currency/rates', intruderSees: [] },
          {
            kind: 'write',
            method: 'POST',
            path: `/api/currency/rates/${body.id}/revisions`,
            body: { validFrom: '2026-01-01', rate: '1' },
          },
        ],
        ownerDataIntact: async () => {
          const rows = (await (await owner.request('GET', '/api/currency/rates')).json()) as {
            rate: string;
          }[];
          return rows.length === 1 && rows[0]?.rate === '4777.123';
        },
      };
    });
    expect(violations).toEqual([]);
  });
});
