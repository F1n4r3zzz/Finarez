import {
  type BudgetView,
  budgetInputSchema,
  budgetUpdateSchema,
  localDateSchema,
} from '@finanz/contracts';
import { type LocalDate, todayIn } from '@finanz/kernel';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import type { Database, Executor } from '../../../db/client';
import { inSnapshot, inUnitOfWork } from '../../../db/unit-of-work';
import { isUuid } from '../../../http/ids';
import { type Auth, getPreferences, requireUser, type UserVariables } from '../../identity';
import { commandHash, onceForKey } from '../../ledger';
import {
  archiveBudget,
  BudgetError,
  budgetHistory,
  budgetViews,
  createBudget,
  updateBudget,
} from '../application/budgets';

const notFound = { error: { code: 'not_found', message: 'Not found' } } as const;
const keyRequired = {
  error: { code: 'idempotency.key_required', message: 'Send an Idempotency-Key header' },
} as const;

/** A history covers at most five years of months, which bounds the work per request. */
const MAX_PERIODS = 60;
const onQuery = z.object({ on: localDateSchema.optional() });
const historyQuery = z.object({
  to: localDateSchema.optional(),
  count: z.coerce.number().int().min(1).max(MAX_PERIODS).default(12),
});

async function today(tx: Executor, userId: string): Promise<LocalDate> {
  return todayIn((await getPreferences(tx, userId))?.timeZone ?? 'UTC');
}

async function oneView(
  tx: Executor,
  userId: string,
  id: string,
  on?: LocalDate,
): Promise<BudgetView> {
  const [view] = await budgetViews(tx, userId, on ?? (await today(tx, userId)), id);
  if (!view) throw new BudgetError('budgets.not_found');
  return view;
}

/** Spending limits per expense category and period, mounted at /api/budgets. */
export function budgetRoutes({ auth, db }: { auth: Auth; db: Database }) {
  return new Hono<{ Variables: UserVariables }>()
    .use(requireUser(auth))
    .onError((error, c) => {
      if (error instanceof BudgetError) {
        if (error.code === 'budgets.not_found') return c.json(notFound, 404);
        const status = error.code === 'budgets.duplicate_category' ? 409 : 422;
        return c.json({ error: { code: error.code, message: error.message } }, status);
      }
      throw error;
    })
    .get('/', async (c) => {
      const q = onQuery.parse(c.req.query());
      const userId = c.var.userId;
      return c.json(
        await inSnapshot(db, async (tx) =>
          budgetViews(tx, userId, q.on ?? (await today(tx, userId))),
        ),
      );
    })
    .post('/', async (c) => {
      const key = c.req.header('Idempotency-Key');
      if (!key || key.length > 200) return c.json(keyRequired, 400);
      const body = await c.req.json();
      const input = budgetInputSchema.parse(body);
      const userId = c.var.userId;
      const hash = commandHash({ method: 'POST', route: '/budgets', params: {}, body });
      const result = await inUnitOfWork(db, (tx) =>
        onceForKey(tx, userId, key, hash, async () => {
          const now = await today(tx, userId);
          const row = await createBudget(tx, userId, {
            ...input,
            carryover: input.carryover ?? false,
            startsOn: input.startsOn ?? now,
          });
          return { status: 201, body: await oneView(tx, userId, row.id, now) };
        }),
      );
      return c.json(result.body as BudgetView, result.status as ContentfulStatusCode);
    })
    .get('/:id', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const q = onQuery.parse(c.req.query());
      const userId = c.var.userId;
      return c.json(await inSnapshot(db, (tx) => oneView(tx, userId, id, q.on)));
    })
    .get('/:id/history', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const q = historyQuery.parse(c.req.query());
      const userId = c.var.userId;
      return c.json(
        await inSnapshot(db, async (tx) =>
          budgetHistory(tx, userId, id, q.to ?? (await today(tx, userId)), q.count),
        ),
      );
    })
    .patch('/:id', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const input = budgetUpdateSchema.parse(await c.req.json());
      const userId = c.var.userId;
      return c.json(
        await inUnitOfWork(db, async (tx) => {
          const now = await today(tx, userId);
          await updateBudget(tx, userId, id, { ...input, from: input.from ?? now });
          return oneView(tx, userId, id, now);
        }),
      );
    })
    .post('/:id/archive', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const userId = c.var.userId;
      return c.json(
        await inUnitOfWork(db, async (tx) => {
          await archiveBudget(tx, userId, id);
          return oneView(tx, userId, id);
        }),
      );
    });
}
