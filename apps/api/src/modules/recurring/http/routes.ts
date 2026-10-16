import {
  confirmOccurrenceSchema,
  localDateSchema,
  type RuleView,
  ruleInputSchema,
  ruleUpdateSchema,
} from '@finanz/contracts';
import { type LocalDate, parseLocalDate, todayIn } from '@finanz/kernel';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Database, Executor } from '../../../db/client';
import { inSnapshot, inUnitOfWork } from '../../../db/unit-of-work';
import { isUuid } from '../../../http/ids';
import { type Auth, getPreferences, requireUser, type UserVariables } from '../../identity';
import { commandHash, LedgerError, onceForKey } from '../../ledger';
import {
  confirmOccurrence,
  createRule,
  endRule,
  occurrenceViews,
  RecurringError,
  ruleViews,
  runDue,
  skipNext,
  skipOccurrence,
  updateRule,
} from '../application/recurring';

const notFound = { error: { code: 'not_found', message: 'Not found' } } as const;
const keyRequired = {
  error: { code: 'idempotency.key_required', message: 'Send an Idempotency-Key header' },
} as const;

async function today(tx: Executor, userId: string): Promise<LocalDate> {
  return todayIn((await getPreferences(tx, userId))?.timeZone ?? 'UTC');
}

async function oneView(tx: Executor, userId: string, id: string): Promise<RuleView> {
  const [view] = await ruleViews(tx, userId, id);
  if (!view) throw new RecurringError('recurring.not_found');
  return view;
}

/** A rule id and one of its dates from the path, or nothing when either is malformed. */
function occurrenceParams(params: { id: string; dueOn: string }) {
  if (!isUuid(params.id) || !localDateSchema.safeParse(params.dueOn).success) return undefined;
  return { id: params.id, dueOn: parseLocalDate(params.dueOn) };
}

/** Movements that repeat, mounted at /api/recurring. */
export function recurringRoutes({ auth, db }: { auth: Auth; db: Database }) {
  return (
    new Hono<{ Variables: UserVariables }>()
      .use(requireUser(auth))
      .onError((error, c) => {
        if (error instanceof RecurringError) {
          if (error.code === 'recurring.not_found') return c.json(notFound, 404);
          const status = error.code === 'recurring.not_pending' ? 409 : 422;
          return c.json({ error: { code: error.code, message: error.message } }, status);
        }
        if (error instanceof LedgerError) {
          return c.json({ error: { code: error.code, message: error.message } }, 422);
        }
        throw error;
      })
      // The app calls this when it opens: whatever came due since is recorded or queued.
      .post('/run', async (c) => {
        const userId = c.var.userId;
        return c.json(
          await inUnitOfWork(db, async (tx) => runDue(tx, userId, await today(tx, userId))),
        );
      })
      .get('/rules', async (c) => {
        const userId = c.var.userId;
        return c.json(await inSnapshot(db, (tx) => ruleViews(tx, userId)));
      })
      .post('/rules', async (c) => {
        const key = c.req.header('Idempotency-Key');
        if (!key || key.length > 200) return c.json(keyRequired, 400);
        const body = await c.req.json();
        const input = ruleInputSchema.parse(body);
        const userId = c.var.userId;
        const hash = commandHash({ method: 'POST', route: '/recurring/rules', params: {}, body });
        const result = await inUnitOfWork(db, (tx) =>
          onceForKey(tx, userId, key, hash, async () => {
            const row = await createRule(tx, userId, input, await today(tx, userId));
            return { status: 201, body: await oneView(tx, userId, row.id) };
          }),
        );
        return c.json(result.body as RuleView, result.status as ContentfulStatusCode);
      })
      .get('/rules/:id', async (c) => {
        const id = c.req.param('id');
        if (!isUuid(id)) return c.json(notFound, 404);
        const userId = c.var.userId;
        return c.json(await inSnapshot(db, (tx) => oneView(tx, userId, id)));
      })
      .patch('/rules/:id', async (c) => {
        const id = c.req.param('id');
        if (!isUuid(id)) return c.json(notFound, 404);
        const input = ruleUpdateSchema.parse(await c.req.json());
        const userId = c.var.userId;
        return c.json(
          await inUnitOfWork(db, async (tx) => {
            await updateRule(tx, userId, id, input, await today(tx, userId));
            return oneView(tx, userId, id);
          }),
        );
      })
      .post('/rules/:id/skip-next', async (c) => {
        const id = c.req.param('id');
        if (!isUuid(id)) return c.json(notFound, 404);
        const userId = c.var.userId;
        return c.json(
          await inUnitOfWork(db, async (tx) => {
            await skipNext(tx, userId, id);
            return oneView(tx, userId, id);
          }),
        );
      })
      .post('/rules/:id/end', async (c) => {
        const id = c.req.param('id');
        if (!isUuid(id)) return c.json(notFound, 404);
        const userId = c.var.userId;
        return c.json(
          await inUnitOfWork(db, async (tx) => {
            await endRule(tx, userId, id);
            return oneView(tx, userId, id);
          }),
        );
      })
      .get('/rules/:id/occurrences', async (c) => {
        const id = c.req.param('id');
        if (!isUuid(id)) return c.json(notFound, 404);
        const userId = c.var.userId;
        return c.json(
          await inSnapshot(db, async (tx) => {
            await oneView(tx, userId, id);
            return occurrenceViews(tx, userId, { ruleId: id });
          }),
        );
      })
      .get('/pending', async (c) => {
        const userId = c.var.userId;
        return c.json(await inSnapshot(db, (tx) => occurrenceViews(tx, userId, { pending: true })));
      })
      .post('/rules/:id/occurrences/:dueOn/confirm', async (c) => {
        const params = occurrenceParams(c.req.param());
        if (!params) return c.json(notFound, 404);
        const input = confirmOccurrenceSchema.parse(await c.req.json());
        const userId = c.var.userId;
        await inUnitOfWork(db, (tx) =>
          confirmOccurrence(tx, userId, params.id, params.dueOn, input),
        );
        return c.json({ ok: true });
      })
      .post('/rules/:id/occurrences/:dueOn/skip', async (c) => {
        const params = occurrenceParams(c.req.param());
        if (!params) return c.json(notFound, 404);
        const userId = c.var.userId;
        await inUnitOfWork(db, (tx) => skipOccurrence(tx, userId, params.id, params.dueOn));
        return c.json({ ok: true });
      })
  );
}
