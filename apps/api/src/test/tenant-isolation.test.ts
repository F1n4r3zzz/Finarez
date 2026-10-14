import { randomUUID } from 'node:crypto';
import { eq, inArray, type SQL, sql } from 'drizzle-orm';
import { integer, type PgColumn, pgSchema, serial, text } from 'drizzle-orm/pg-core';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Database } from '../db/client';
import { ownedBy } from '../db/tenancy';
import { type Auth, requireUser, type UserVariables } from '../modules/identity';
import { createTestContext, TEST_APP_URL, type TestClient, type TestContext } from './context';
import { findIsolationViolations, type ProbeKind, type Seeded } from './tenant-isolation';

// A small owned resource with every access pattern a module will have: single, nested,
// list, aggregate, write and bulk. It exists only to prove the harness catches leaks.
const SCHEMA = `isolation_fixture_${process.pid}`;
const fixture = pgSchema(SCHEMA);
const notes = fixture.table('notes', {
  id: serial().primaryKey(),
  userId: text().notNull(),
  title: text().notNull(),
  amount: integer().notNull(),
});
const comments = fixture.table('comments', {
  id: serial().primaryKey(),
  noteId: integer().notNull(),
  userId: text().notNull(),
  body: text().notNull(),
});

const notFound = { error: { code: 'not_found', message: 'Not found' } } as const;

/** `holes` drops the owner check from the named operations, to show the harness notices. */
function fixtureRoutes(auth: Auth, db: Database, holes: ReadonlySet<ProbeKind>) {
  const scope = (kind: ProbeKind, column: PgColumn, userId: string, condition?: SQL) =>
    holes.has(kind) ? condition : ownedBy(column, userId, condition);

  return new Hono<{ Variables: UserVariables }>()
    .use(requireUser(auth))
    .post('/notes', async (c) => {
      const { title, amount } = await c.req.json<{ title: string; amount: number }>();
      const [row] = await db
        .insert(notes)
        .values({ userId: c.var.userId, title, amount })
        .returning();
      return c.json(row, 201);
    })
    .post('/notes/:id/comments', async (c) => {
      const { body } = await c.req.json<{ body: string }>();
      const [row] = await db
        .insert(comments)
        .values({ noteId: Number(c.req.param('id')), userId: c.var.userId, body })
        .returning();
      return c.json(row, 201);
    })
    .get('/notes', async (c) => {
      return c.json(
        await db
          .select()
          .from(notes)
          .where(scope('list', notes.userId, c.var.userId)),
      );
    })
    .get('/notes/total', async (c) => {
      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${notes.amount}), 0)::int` })
        .from(notes)
        .where(scope('aggregate', notes.userId, c.var.userId));
      return c.json(row);
    })
    .get('/notes/:id', async (c) => {
      const byId = eq(notes.id, Number(c.req.param('id')));
      const [row] = await db
        .select()
        .from(notes)
        .where(scope('single', notes.userId, c.var.userId, byId));
      return row ? c.json(row) : c.json(notFound, 404);
    })
    .get('/notes/:id/comments/:commentId', async (c) => {
      const byId = eq(comments.id, Number(c.req.param('commentId')));
      const [row] = await db
        .select()
        .from(comments)
        .where(scope('nested', comments.userId, c.var.userId, byId));
      return row ? c.json(row) : c.json(notFound, 404);
    })
    .put('/notes/:id', async (c) => {
      const { title } = await c.req.json<{ title: string }>();
      const byId = eq(notes.id, Number(c.req.param('id')));
      const updated = await db
        .update(notes)
        .set({ title })
        .where(scope('write', notes.userId, c.var.userId, byId))
        .returning({ id: notes.id });
      return updated.length > 0 ? c.json({ ok: true }) : c.json(notFound, 404);
    })
    .post('/notes/bulk-delete', async (c) => {
      const { ids } = await c.req.json<{ ids: number[] }>();
      // All or nothing: if any id is not the user's, delete none and answer 404.
      if (!holes.has('bulk')) {
        const mine = await db
          .select({ id: notes.id })
          .from(notes)
          .where(ownedBy(notes.userId, c.var.userId, inArray(notes.id, ids)));
        if (mine.length !== ids.length) return c.json(notFound, 404);
      }
      await db.delete(notes).where(inArray(notes.id, ids));
      return c.json({ deleted: ids.length });
    });
}

const ctx = createTestContext();

beforeAll(async () => {
  await ctx.db.execute(sql`create schema ${sql.identifier(SCHEMA)}`);
  await ctx.db.execute(
    sql`create table ${notes} (id serial primary key, user_id text not null, title text not null, amount integer not null)`,
  );
  await ctx.db.execute(
    sql`create table ${comments} (id serial primary key, note_id integer not null, user_id text not null, body text not null)`,
  );
});
afterAll(async () => {
  await ctx.db.execute(sql`drop schema ${sql.identifier(SCHEMA)} cascade`);
  await ctx.close();
});

type Seed = Parameters<typeof findIsolationViolations>[1];

/**
 * A fresh app (same database and auth) with the fixture mounted. Hono freezes its routes
 * after the first request, so each variant gets its own app instance.
 */
function variant(holes: ProbeKind[]): { ctx: TestContext; seed: Seed } {
  const app = createApp({ db: ctx.db, auth: ctx.auth, appUrl: TEST_APP_URL });
  app.route('/fx', fixtureRoutes(ctx.auth, ctx.db, new Set(holes)));

  const seed = async (owner: TestClient, intruder: TestClient): Promise<Seeded> => {
    const post = async <T>(client: TestClient, path: string, body: unknown) =>
      (await (await client.request('POST', `/api/fx${path}`, body)).json()) as T;
    const title = `Secreto-${randomUUID()}`;
    const comment = `Comentario-${randomUUID()}`;
    const a = await post<{ id: number }>(owner, '/notes', { title, amount: 7_919_331 });
    const b = await post<{ id: number }>(owner, '/notes', {
      title: `${title}-2`,
      amount: 1_234_567,
    });
    const c = await post<{ id: number }>(owner, `/notes/${a.id}/comments`, { body: comment });
    const mine = await post<Record<string, unknown> & { id: number }>(intruder, '/notes', {
      title: 'mía',
      amount: 1,
    });

    return {
      // Titles, the comment, one amount and the owner's total (7,919,331 + 1,234,567).
      secrets: [title, comment, '7919331', '9153898'],
      probes: [
        { kind: 'single', method: 'GET', path: `/api/fx/notes/${a.id}` },
        { kind: 'nested', method: 'GET', path: `/api/fx/notes/${a.id}/comments/${c.id}` },
        { kind: 'list', method: 'GET', path: '/api/fx/notes', intruderSees: [mine] },
        {
          kind: 'aggregate',
          method: 'GET',
          path: '/api/fx/notes/total',
          intruderSees: { total: 1 },
        },
        {
          kind: 'write',
          method: 'PUT',
          path: `/api/fx/notes/${a.id}`,
          body: { title: 'hackeado' },
        },
        {
          kind: 'bulk',
          method: 'POST',
          path: '/api/fx/notes/bulk-delete',
          body: { ids: [mine.id, b.id] },
        },
      ],
      ownerDataIntact: async () => {
        const rows = (await (await owner.request('GET', '/api/fx/notes')).json()) as {
          title: string;
        }[];
        return (
          rows
            .map((r) => r.title)
            .sort()
            .join('|') === [title, `${title}-2`].sort().join('|')
        );
      },
    };
  };
  return { ctx: { ...ctx, app }, seed };
}

describe('tenant-isolation harness', () => {
  it('finds nothing wrong when every query is scoped to its owner', async () => {
    const secure = variant([]);
    expect(await findIsolationViolations(secure.ctx, secure.seed)).toEqual([]);
  });

  it.each<ProbeKind>(['single', 'nested', 'list', 'aggregate', 'write', 'bulk'])(
    'catches a missing owner check in a %s request',
    async (hole) => {
      const leaky = variant([hole]);
      const violations = await findIsolationViolations(leaky.ctx, leaky.seed);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => v.probe.startsWith(`${hole}:`))).toBe(true);
    },
  );
});
