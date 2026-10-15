import type { Category } from '@finanz/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, signedInUser, type TestClient } from '../../test/context';
import { findIsolationViolations } from '../../test/tenant-isolation';
import { DEFAULT_CATEGORIES } from './application/defaults';

const ctx = createTestContext();
afterAll(() => ctx.close());

async function list(client: TestClient): Promise<Category[]> {
  return (await (await client.request('GET', '/api/categories')).json()) as Category[];
}

async function create(client: TestClient, body: unknown) {
  const res = await client.request('POST', '/api/categories', body);
  return {
    status: res.status,
    body: (await res.json()) as Category & { error?: { code: string } },
  };
}

async function patch(client: TestClient, id: string, body: unknown) {
  const res = await client.request('PATCH', `/api/categories/${id}`, body);
  return {
    status: res.status,
    body: (await res.json()) as Category & { error?: { code: string } },
  };
}

const byName = (categories: Category[], name: string, kind = 'expense') => {
  const found = categories.find((c) => c.name === name && c.kind === kind);
  if (!found) throw new Error(`No ${kind} category "${name}"`);
  return found;
};

describe('default categories', () => {
  it('are created in Spanish the first time, exactly once, even under concurrent requests', async () => {
    const { client } = await signedInUser(ctx);
    const [a, b, c] = await Promise.all([list(client), list(client), list(client)]);
    const expected = [...DEFAULT_CATEGORIES.income, ...DEFAULT_CATEGORIES.expense].reduce(
      (n, d) => n + 1 + (d.children?.length ?? 0),
      0,
    );
    for (const result of [a, b, c]) expect(result).toHaveLength(expected);
    expect(byName(a, 'Mercado').kind).toBe('expense');
    expect(byName(a, 'Salario', 'income').parentId).toBeNull();
    expect(await list(client)).toEqual(a);
  });
});

describe('household bills', () => {
  const childNames = (all: Category[], parent: Category) =>
    all
      .filter((c) => c.parentId === parent.id)
      .map((c) => c.name)
      .sort();

  it('each have their own subcategory, apart from the home itself', async () => {
    const { client } = await signedInUser(ctx);
    const all = await list(client);
    expect(childNames(all, byName(all, 'Servicios del hogar'))).toEqual(
      ['Agua', 'Aseo', 'Celular', 'Gas', 'Internet', 'Luz', 'Televisión'].sort(),
    );
    expect(childNames(all, byName(all, 'Vivienda'))).toEqual(
      ['Administración', 'Arriendo', 'Reparaciones y mantenimiento'].sort(),
    );
  });

  it('are split out for earlier users once, without moving any past movement', async () => {
    const { client } = await signedInUser(ctx);
    const session = (await (await client.request('GET', '/api/auth/get-session')).json()) as {
      user: { id: string };
    };
    const userId = session.user.id;
    const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
    // How version 1 left this user: flat bills, plus a subcategory they made themselves.
    await ctx.db.execute(
      sql`insert into categories.seeded_users (user_id, version) values (${userId}, 1)`,
    );
    await ctx.db.execute(sql`insert into categories.categories (user_id, id, kind, name) values
      (${userId}, ${id(1)}, 'expense', 'Servicios públicos'),
      (${userId}, ${id(2)}, 'expense', 'Internet y celular'),
      (${userId}, ${id(3)}, 'expense', 'Vivienda'),
      (${userId}, ${id(4)}, 'expense', 'Mercado')`);
    await ctx.db.execute(sql`insert into categories.categories (user_id, id, kind, name, parent_id)
      values (${userId}, ${id(5)}, 'expense', 'agua', ${id(1)})`);

    const results = await Promise.all([list(client), list(client), list(client)]);
    for (const r of results) expect(r).toHaveLength(12);
    const all = await list(client);
    const services = all.find((c) => c.id === id(1));
    expect(services).toMatchObject({ name: 'Servicios del hogar', parentId: null });
    expect(all.find((c) => c.id === id(2))).toMatchObject({
      name: 'Internet y celular',
      parentId: id(1),
    });
    expect(childNames(all, services as Category)).toEqual(
      ['agua', 'Aseo', 'Gas', 'Internet y celular', 'Luz', 'Televisión'].sort(),
    );
    expect(childNames(all, byName(all, 'Vivienda'))).toEqual(
      ['Administración', 'Arriendo', 'Reparaciones y mantenimiento'].sort(),
    );
  });
});

describe('one level of subcategories', () => {
  it('accepts a subcategory under a root of the same kind', async () => {
    const { client } = await signedInUser(ctx);
    const transporte = byName(await list(client), 'Transporte');
    const res = await create(client, { kind: 'expense', name: 'Peajes', parentId: transporte.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Peajes', parentId: transporte.id, kind: 'expense' });
  });

  it('refuses every way of breaking the hierarchy', async () => {
    const { client } = await signedInUser(ctx);
    const all = await list(client);
    const transporte = byName(all, 'Transporte');
    const vivienda = byName(all, 'Vivienda');
    const salario = byName(all, 'Salario', 'income');
    const { body: peajes } = await create(client, {
      kind: 'expense',
      name: 'Peajes',
      parentId: transporte.id,
    });

    const childOfChild = await create(client, {
      kind: 'expense',
      name: 'Chía',
      parentId: peajes.id,
    });
    expect(childOfChild.body.error?.code).toBe('category.invalid_parent');

    const otherKind = await create(client, {
      kind: 'expense',
      name: 'Bonos',
      parentId: salario.id,
    });
    expect(otherKind.body.error?.code).toBe('category.invalid_parent');

    const selfParent = await patch(client, vivienda.id, { parentId: vivienda.id });
    expect(selfParent.body.error?.code).toBe('category.invalid_parent');

    const demoteParent = await patch(client, transporte.id, { parentId: vivienda.id });
    expect(demoteParent.status).toBe(409);
    expect(demoteParent.body.error?.code).toBe('category.has_children');

    // The database itself refuses it too, without the application's check.
    await expect(
      ctx.db.execute(
        sql`update categories.categories set parent_id = ${vivienda.id} where id = ${transporte.id}`,
      ),
    ).rejects.toThrow();
  });

  it("can't hang a category under another user's category", async () => {
    const owner = await signedInUser(ctx);
    const other = await signedInUser(ctx);
    const theirs = byName(await list(other.client), 'Transporte');
    const res = await create(owner.client, {
      kind: 'expense',
      name: 'Peajes',
      parentId: theirs.id,
    });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('category.invalid_parent');
  });
});

describe('names', () => {
  it('are unique among active categories in the same place, ignoring case', async () => {
    const { client } = await signedInUser(ctx);
    const duplicate = await create(client, { kind: 'expense', name: 'mercado' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error?.code).toBe('category.duplicate_name');
    // The same name as an income category is fine.
    expect((await create(client, { kind: 'income', name: 'Mercado' })).status).toBe(201);
  });

  it('can be reused once the old category is archived; archiving keeps it listed', async () => {
    const { client } = await signedInUser(ctx);
    const mascotas = byName(await list(client), 'Mascotas');
    expect((await patch(client, mascotas.id, { archived: true })).body.archived).toBe(true);
    expect((await create(client, { kind: 'expense', name: 'Mascotas' })).status).toBe(201);
    expect((await list(client)).filter((c) => c.name === 'Mascotas')).toHaveLength(2);
  });

  it('can be renamed', async () => {
    const { client } = await signedInUser(ctx);
    const hogar = byName(await list(client), 'Hogar');
    expect((await patch(client, hogar.id, { name: 'Casa' })).body.name).toBe('Casa');
  });
});

describe('categories: tenant isolation', () => {
  it("never shows or changes another user's categories", async () => {
    const violations = await findIsolationViolations(ctx, async (owner, intruder) => {
      const { body: secret } = await create(owner, { kind: 'expense', name: 'Club secreto 4417' });
      const intruderSees = await list(intruder);
      return {
        secrets: ['Club secreto 4417'],
        probes: [
          { kind: 'list', method: 'GET', path: '/api/categories', intruderSees },
          {
            kind: 'write',
            method: 'PATCH',
            path: `/api/categories/${secret.id}`,
            body: { name: 'Hackeado' },
          },
          {
            kind: 'write',
            method: 'PATCH',
            path: `/api/categories/${secret.id}`,
            body: { archived: true },
          },
        ],
        ownerDataIntact: async () => {
          const mine = byName(await list(owner), 'Club secreto 4417');
          return !mine.archived;
        },
      };
    });
    expect(violations).toEqual([]);
  });
});
