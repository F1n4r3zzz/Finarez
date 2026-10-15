import {
  type AllocationView,
  allocationInputSchema,
  type GoalView,
  goalInputSchema,
  goalUpdateSchema,
} from '@finanz/contracts';
import { parseLocalDate, todayIn } from '@finanz/kernel';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Database, Executor } from '../../../db/client';
import { inSnapshot, inUnitOfWork } from '../../../db/unit-of-work';
import { isUuid } from '../../../http/ids';
import { type Auth, getPreferences, requireUser, type UserVariables } from '../../identity';
import { commandHash, LedgerError, onceForKey } from '../../ledger';
import {
  allocate,
  archiveGoal,
  createGoal,
  goalViews,
  listAllocations,
  SavingsError,
  savingsAccounts,
  updateGoal,
  voidAllocation,
} from '../application/savings';

const notFound = { error: { code: 'not_found', message: 'Not found' } } as const;
const keyRequired = {
  error: { code: 'idempotency.key_required', message: 'Send an Idempotency-Key header' },
} as const;

async function today(tx: Executor, userId: string) {
  return todayIn((await getPreferences(tx, userId))?.timeZone ?? 'UTC');
}

async function oneView(tx: Executor, userId: string, id: string): Promise<GoalView> {
  const [view] = await goalViews(tx, userId, await today(tx, userId), id);
  if (!view) throw new SavingsError('savings.goal_not_found');
  return view;
}

/** Savings goals: money set aside in real accounts, mounted at /api/savings. */
export function savingsRoutes({ auth, db }: { auth: Auth; db: Database }) {
  return new Hono<{ Variables: UserVariables }>()
    .use(requireUser(auth))
    .onError((error, c) => {
      if (error instanceof SavingsError) {
        if (
          error.code === 'savings.goal_not_found' ||
          error.code === 'savings.allocation_not_found'
        )
          return c.json(notFound, 404);
        const status = error.code === 'savings.duplicate_name' ? 409 : 422;
        return c.json({ error: { code: error.code, message: error.message } }, status);
      }
      if (error instanceof LedgerError) {
        const status: ContentfulStatusCode =
          error.code === 'ledger.stale_version' || error.code === 'ledger.already_void' ? 409 : 422;
        return c.json({ error: { code: error.code, message: error.message } }, status);
      }
      throw error;
    })
    .get('/goals', async (c) => {
      const userId = c.var.userId;
      return c.json(
        await inSnapshot(db, async (tx) => goalViews(tx, userId, await today(tx, userId))),
      );
    })
    .post('/goals', async (c) => {
      const key = c.req.header('Idempotency-Key');
      if (!key || key.length > 200) return c.json(keyRequired, 400);
      const body = await c.req.json();
      const input = goalInputSchema.parse(body);
      const userId = c.var.userId;
      const hash = commandHash({ method: 'POST', route: '/savings/goals', params: {}, body });
      const result = await inUnitOfWork(db, (tx) =>
        onceForKey(tx, userId, key, hash, async () => {
          const goal = await createGoal(tx, userId, input);
          return { status: 201, body: await oneView(tx, userId, goal.id) };
        }),
      );
      return c.json(result.body as GoalView, result.status as ContentfulStatusCode);
    })
    .patch('/goals/:id', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const input = goalUpdateSchema.parse(await c.req.json());
      const userId = c.var.userId;
      return c.json(
        await inUnitOfWork(db, async (tx) => {
          await updateGoal(tx, userId, id, input);
          return oneView(tx, userId, id);
        }),
      );
    })
    .post('/goals/:id/archive', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const userId = c.var.userId;
      return c.json(
        await inUnitOfWork(db, async (tx) => {
          await archiveGoal(tx, userId, id);
          return oneView(tx, userId, id);
        }),
      );
    })
    .get('/goals/:id/allocations', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const userId = c.var.userId;
      return c.json(await inSnapshot(db, (tx) => listAllocations(tx, userId, id)));
    })
    .post('/goals/:id/allocations', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const key = c.req.header('Idempotency-Key');
      if (!key || key.length > 200) return c.json(keyRequired, 400);
      const body = await c.req.json();
      const input = allocationInputSchema.parse(body);
      const userId = c.var.userId;
      const hash = commandHash({
        method: 'POST',
        route: '/savings/goals/:id/allocations',
        params: { id },
        body,
      });
      const result = await inUnitOfWork(db, (tx) =>
        onceForKey(tx, userId, key, hash, async () => {
          const row = await allocate(tx, { userId }, id, {
            ...input,
            occurredOn: parseLocalDate(input.occurredOn),
          });
          const view = (await listAllocations(tx, userId, id)).find((a) => a.id === row.id);
          return { status: 201, body: view };
        }),
      );
      return c.json(result.body as AllocationView, result.status as ContentfulStatusCode);
    })
    .post('/goals/:id/allocations/:allocationId/void', async (c) => {
      const { id, allocationId } = c.req.param();
      if (!isUuid(id) || !isUuid(allocationId)) return c.json(notFound, 404);
      const userId = c.var.userId;
      await inUnitOfWork(db, (tx) => voidAllocation(tx, { userId }, id, allocationId));
      return c.json({ ok: true });
    })
    .get('/accounts', async (c) => {
      const userId = c.var.userId;
      return c.json(
        await inSnapshot(db, async (tx) => savingsAccounts(tx, userId, await today(tx, userId))),
      );
    });
}
