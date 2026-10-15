import {
  type DebtView,
  debtInputSchema,
  debtTermsSchema,
  type PaymentView,
  type ProposalView,
  paymentEditSchema,
  paymentInputSchema,
  type ScheduleView,
} from '@finanz/contracts';
import { parseLocalDate, todayIn } from '@finanz/kernel';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import type { Database, Executor } from '../../../db/client';
import { inSnapshot, inUnitOfWork } from '../../../db/unit-of-work';
import { isUuid } from '../../../http/ids';
import { type Auth, getPreferences, requireUser, type UserVariables } from '../../identity';
import { accountsById, commandHash, LedgerError, onceForKey } from '../../ledger';
import {
  createDebt,
  DebtError,
  debtView,
  editPayment,
  getDebt,
  listDebts,
  listPayments,
  monthlyRate,
  nextDue,
  outstandingBefore,
  proposePayment,
  recordPayment,
  updateDebt,
  voidPayment,
} from '../application/debts';
import { installmentFor, projectSchedule } from '../domain/schedule';

const notFound = { error: { code: 'not_found', message: 'Not found' } } as const;
const keyRequired = {
  error: { code: 'idempotency.key_required', message: 'Send an Idempotency-Key header' },
} as const;

async function today(tx: Executor, userId: string) {
  return todayIn((await getPreferences(tx, userId))?.timeZone ?? 'UTC');
}

async function oneView(tx: Executor, userId: string, id: string): Promise<DebtView> {
  const debt = await getDebt(tx, userId, id);
  const day = await today(tx, userId);
  const owed = await outstandingBefore(tx, userId, debt, day);
  const account = (await accountsById(tx, userId, [debt.accountId])).get(debt.accountId);
  return debtView(debt, owed, account, day);
}

const proposalQuery = z.object({
  amountMinor: z.string().regex(/^[1-9]\d{0,18}$/),
  paidOn: z.string(),
});

/** Loans and credit cards, mounted at /api/debts. */
export function debtRoutes({ auth, db }: { auth: Auth; db: Database }) {
  return new Hono<{ Variables: UserVariables }>()
    .use(requireUser(auth))
    .onError((error, c) => {
      if (error instanceof DebtError) {
        const status =
          error.code === 'debt.not_found' || error.code === 'debt.payment_not_found' ? 404 : 422;
        if (status === 404) return c.json(notFound, 404);
        return c.json({ error: { code: error.code, message: error.message } }, status);
      }
      if (error instanceof LedgerError) {
        const status: ContentfulStatusCode =
          error.code === 'ledger.stale_version' || error.code === 'ledger.already_void' ? 409 : 422;
        return c.json({ error: { code: error.code, message: error.message } }, status);
      }
      throw error;
    })
    .get('/', async (c) => {
      const userId = c.var.userId;
      return c.json(
        await inSnapshot(db, async (tx) => listDebts(tx, userId, await today(tx, userId))),
      );
    })
    .post('/', async (c) => {
      const key = c.req.header('Idempotency-Key');
      if (!key || key.length > 200) return c.json(keyRequired, 400);
      const body = await c.req.json();
      const input = debtInputSchema.parse(body);
      const userId = c.var.userId;
      const hash = commandHash({ method: 'POST', route: '/debts', params: {}, body });
      const result = await inUnitOfWork(db, (tx) =>
        onceForKey(tx, userId, key, hash, async () => {
          const debt = await createDebt(tx, { userId }, input);
          return { status: 201, body: await oneView(tx, userId, debt.id) };
        }),
      );
      return c.json(result.body as DebtView, result.status as ContentfulStatusCode);
    })
    .patch('/:id', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const input = debtTermsSchema.parse(await c.req.json());
      const userId = c.var.userId;
      return c.json(
        await inUnitOfWork(db, async (tx) => {
          await updateDebt(tx, userId, id, input);
          return oneView(tx, userId, id);
        }),
      );
    })
    .get('/:id/payments', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const userId = c.var.userId;
      return c.json(
        await inSnapshot(db, (tx): Promise<PaymentView[]> => listPayments(tx, userId, id)),
      );
    })
    .get('/:id/proposal', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const q = proposalQuery.parse(c.req.query());
      const userId = c.var.userId;
      const p = await inSnapshot(db, (tx) =>
        proposePayment(tx, userId, id, BigInt(q.amountMinor), parseLocalDate(q.paidOn)),
      );
      const body: ProposalView = {
        outstandingMinor: p.outstandingMinor.toString(),
        interestMinor: p.interestMinor.toString(),
        principalMinor: p.principalMinor.toString(),
      };
      return c.json(body);
    })
    .post('/:id/payments', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const key = c.req.header('Idempotency-Key');
      if (!key || key.length > 200) return c.json(keyRequired, 400);
      const body = await c.req.json();
      const input = paymentInputSchema.parse(body);
      const userId = c.var.userId;
      const hash = commandHash({
        method: 'POST',
        route: '/debts/:id/payments',
        params: { id },
        body,
      });
      const result = await inUnitOfWork(db, (tx) =>
        onceForKey(tx, userId, key, hash, async () => {
          const transactionId = await recordPayment(tx, { userId }, id, input);
          const payment = (await listPayments(tx, userId, id)).find(
            (p) => p.transactionId === transactionId,
          );
          return { status: 201, body: payment };
        }),
      );
      return c.json(result.body as PaymentView, result.status as ContentfulStatusCode);
    })
    .put('/:id/payments/:transactionId', async (c) => {
      const { id, transactionId } = c.req.param();
      if (!isUuid(id) || !isUuid(transactionId)) return c.json(notFound, 404);
      const input = paymentEditSchema.parse(await c.req.json());
      const userId = c.var.userId;
      const view = await inUnitOfWork(db, async (tx) => {
        await editPayment(tx, { userId }, id, transactionId, input.version, input);
        return (await listPayments(tx, userId, id)).find((p) => p.transactionId === transactionId);
      });
      return c.json(view);
    })
    .post('/:id/payments/:transactionId/void', async (c) => {
      const { id, transactionId } = c.req.param();
      if (!isUuid(id) || !isUuid(transactionId)) return c.json(notFound, 404);
      const { version } = z.object({ version: z.number().int().min(1) }).parse(await c.req.json());
      const userId = c.var.userId;
      await inUnitOfWork(db, (tx) => voidPayment(tx, { userId }, id, transactionId, version));
      return c.json({ ok: true });
    })
    .get('/:id/schedule', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const userId = c.var.userId;
      const body = await inSnapshot(db, async (tx): Promise<ScheduleView> => {
        const debt = await getDebt(tx, userId, id);
        const day = await today(tx, userId);
        const owed = await outstandingBefore(tx, userId, debt, day);
        const rate = monthlyRate(debt);
        const increment = BigInt(debt.roundingMinor);
        const installment =
          debt.installmentMinor ??
          (debt.originalPrincipalMinor && debt.termMonths
            ? installmentFor(debt.originalPrincipalMinor, rate, debt.termMonths, increment)
            : null);
        const firstDueOn = nextDue(debt.dueDay, day);
        if (!installment || !firstDueOn || !debt.dueDay || owed <= 0n)
          return { rows: [], neverEnds: false };
        let remaining: number | undefined;
        if (debt.startOn && debt.termMonths) {
          const [sy, sm] = debt.startOn.split('-').map(Number) as [number, number];
          const [fy, fm] = firstDueOn.split('-').map(Number) as [number, number];
          remaining = Math.max(1, debt.termMonths - ((fy - sy) * 12 + (fm - sm)));
        }
        const rows = projectSchedule({
          outstandingMinor: owed,
          rate,
          installmentMinor: installment,
          increment,
          firstDueOn,
          dueDay: debt.dueDay,
          remainingInstallments: remaining,
        });
        const neverEnds = rows.length === 0 || (rows.at(-1)?.balanceAfterMinor ?? 0n) > 0n;
        return {
          rows: rows.map((r) => ({
            dueOn: r.dueOn,
            installmentMinor: r.installmentMinor.toString(),
            interestMinor: r.interestMinor.toString(),
            principalMinor: r.principalMinor.toString(),
            balanceAfterMinor: r.balanceAfterMinor.toString(),
          })),
          neverEnds,
        };
      });
      return c.json(body);
    });
}
