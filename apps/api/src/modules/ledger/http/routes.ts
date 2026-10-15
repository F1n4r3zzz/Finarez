import {
  type AccountView,
  accountInputSchema,
  accountUpdateSchema,
  draftSchema,
  editTransactionSchema,
  restoreTransactionSchema,
  type TransactionView,
  voidTransactionSchema,
} from '@finanz/contracts';
import { parseCurrencyCode, parseLocalDate, todayIn } from '@finanz/kernel';
import { and, desc, eq, exists, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import type { Database, Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { inSnapshot, inUnitOfWork } from '../../../db/unit-of-work';
import { isUuid } from '../../../http/ids';
import { type Auth, getPreferences, requireUser, type UserVariables } from '../../identity';
import {
  type AccountRow,
  createAccount,
  listAccounts,
  updateAccount,
} from '../application/accounts';
import { commandHash, IdempotencyKeyReusedError, onceForKey } from '../application/idempotency';
import { balancesAsOf } from '../application/reads';
import type { EntryRow, TransactionRow } from '../application/store';
import {
  editTransaction,
  getTransaction,
  postTransaction,
  restoreTransaction,
  voidTransaction,
} from '../application/transactions';
import { LedgerError } from '../domain/posting';
import { entries, transactions } from '../infra/schema';

const notFound = { error: { code: 'not_found', message: 'Not found' } } as const;
const keyRequired = {
  error: { code: 'idempotency.key_required', message: 'Send an Idempotency-Key header' },
} as const;

const STATUS: Partial<Record<LedgerError['code'], ContentfulStatusCode>> = {
  'ledger.not_found': 404,
  'ledger.stale_version': 409,
  'ledger.reconciled_change': 409,
  'ledger.managed_transaction': 409,
  'ledger.already_void': 409,
  'ledger.not_void': 409,
};

function accountView(row: AccountRow, balanceMinor = 0n): AccountView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as AccountView['kind'],
    subtype: row.subtype as AccountView['subtype'],
    currency: parseCurrencyCode(row.currency),
    institution: row.institution,
    openedOn: parseLocalDate(row.openedOn),
    archived: row.archivedAt !== null,
    balanceMinor: balanceMinor.toString(),
  };
}

/** Today's balances, as seen in the user's time zone. */
async function withBalances(
  db: Executor,
  userId: string,
  rows: AccountRow[],
): Promise<AccountView[]> {
  if (rows.length === 0) return [];
  const preferences = await getPreferences(db, userId);
  const today = todayIn(preferences?.timeZone ?? 'UTC');
  const balances = new Map(
    (
      await balancesAsOf(
        db,
        userId,
        today,
        rows.map((r) => r.id),
      )
    ).map((b) => [b.accountId, b.balanceMinor]),
  );
  return rows.map((r) => accountView(r, balances.get(r.id) ?? 0n));
}

function transactionView(header: TransactionRow, rows: readonly EntryRow[]): TransactionView {
  return {
    id: header.id,
    occurredOn: parseLocalDate(header.occurredOn),
    kind: header.kind,
    status: header.status,
    managedBy: header.managedBy,
    description: header.description,
    payee: header.payee,
    notes: header.notes,
    version: header.version,
    entries: rows.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      accountKind: e.accountKind,
      currency: parseCurrencyCode(e.currency),
      amountMinor: e.amountMinor.toString(),
      categoryId: e.categoryId,
      memo: e.memo,
      reconciled: e.reconciledAt !== null,
    })),
  };
}

async function loadView(tx: Executor, userId: string, id: string): Promise<TransactionView> {
  const found = await getTransaction(tx, userId, id);
  if (!found) throw new LedgerError('ledger.not_found');
  return transactionView(found.header, found.entries);
}

const listQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  accountId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** Accounts and transactions, mounted at /api/ledger. */
export function ledgerRoutes({ auth, db }: { auth: Auth; db: Database }) {
  return new Hono<{ Variables: UserVariables }>()
    .use(requireUser(auth))
    .onError((error, c) => {
      if (error instanceof LedgerError) {
        const status = STATUS[error.code] ?? 422;
        if (status === 404) return c.json(notFound, 404);
        return c.json({ error: { code: error.code, message: error.message } }, status);
      }
      if (error instanceof IdempotencyKeyReusedError) {
        return c.json({ error: { code: 'idempotency.key_reused', message: error.message } }, 422);
      }
      throw error;
    })

    .get('/accounts', async (c) =>
      c.json(
        await inSnapshot(db, async (tx) =>
          withBalances(tx, c.var.userId, await listAccounts(tx, c.var.userId)),
        ),
      ),
    )
    .post('/accounts', async (c) => {
      const key = c.req.header('Idempotency-Key');
      if (!key || key.length > 200) return c.json(keyRequired, 400);
      const body = await c.req.json();
      const input = accountInputSchema.parse(body);
      const userId = c.var.userId;
      const hash = commandHash({ method: 'POST', route: '/ledger/accounts', params: {}, body });
      // Creating an account can post its opening balance: a retry must never do it twice.
      const result = await inUnitOfWork(db, (tx) =>
        onceForKey(tx, userId, key, hash, async () => {
          const row = await createAccount(tx, { userId }, input);
          const [view] = await withBalances(tx, userId, [row]);
          return { status: 201, body: view };
        }),
      );
      return c.json(result.body as AccountView, result.status as ContentfulStatusCode);
    })
    .patch('/accounts/:id', async (c) => {
      const input = accountUpdateSchema.parse(await c.req.json());
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const row = await updateAccount(db, c.var.userId, id, input);
      const [view] = await withBalances(db, c.var.userId, [row]);
      return c.json(view);
    })

    .get('/transactions', async (c) => {
      const q = listQuery.parse(c.req.query());
      const conditions: (SQL | undefined)[] = [
        q.from ? gte(transactions.occurredOn, parseLocalDate(q.from)) : undefined,
        q.to ? lte(transactions.occurredOn, parseLocalDate(q.to)) : undefined,
        q.accountId
          ? exists(
              db
                .select()
                .from(entries)
                .where(
                  and(
                    eq(entries.userId, transactions.userId),
                    eq(entries.transactionId, transactions.id),
                    eq(entries.accountId, q.accountId),
                  ),
                ),
            )
          : undefined,
      ];
      // Headers and their entries from one snapshot: never a posted header without its lines.
      const views = await inSnapshot(db, async (tx) => {
        const headers = await tx
          .select()
          .from(transactions)
          .where(ownedBy(transactions.userId, c.var.userId, ...conditions))
          .orderBy(desc(transactions.occurredOn), desc(transactions.id))
          .limit(q.limit);
        const rows = headers.length
          ? await tx
              .select()
              .from(entries)
              .where(
                ownedBy(
                  entries.userId,
                  c.var.userId,
                  inArray(
                    entries.transactionId,
                    headers.map((h) => h.id),
                  ),
                ),
              )
          : [];
        return headers.map((h) =>
          transactionView(
            h,
            rows.filter((e) => e.transactionId === h.id),
          ),
        );
      });
      return c.json(views);
    })
    .get('/transactions/:id', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      return c.json(await inSnapshot(db, (tx) => loadView(tx, c.var.userId, id)));
    })
    .post('/transactions', async (c) => {
      const key = c.req.header('Idempotency-Key');
      if (!key || key.length > 200) return c.json(keyRequired, 400);
      const body = await c.req.json();
      const draft = draftSchema.parse(body);
      const userId = c.var.userId;
      const hash = commandHash({ method: 'POST', route: '/ledger/transactions', params: {}, body });
      const result = await inUnitOfWork(db, (tx) =>
        onceForKey(tx, userId, key, hash, async () => {
          const id = await postTransaction(tx, { userId }, draft);
          return { status: 201, body: await loadView(tx, userId, id) };
        }),
      );
      return c.json(result.body as TransactionView, result.status as ContentfulStatusCode);
    })
    .put('/transactions/:id', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const input = editTransactionSchema.parse(await c.req.json());
      const userId = c.var.userId;
      const view = await inUnitOfWork(db, async (tx) => {
        await editTransaction(tx, { userId }, id, input.version, input.draft, input);
        return loadView(tx, userId, id);
      });
      return c.json(view);
    })
    .post('/transactions/:id/void', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const input = voidTransactionSchema.parse(await c.req.json());
      const userId = c.var.userId;
      const view = await inUnitOfWork(db, async (tx) => {
        await voidTransaction(tx, { userId }, id, input.version, input);
        return loadView(tx, userId, id);
      });
      return c.json(view);
    })
    .post('/transactions/:id/restore', async (c) => {
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      const input = restoreTransactionSchema.parse(await c.req.json());
      const userId = c.var.userId;
      const view = await inUnitOfWork(db, async (tx) => {
        await restoreTransaction(tx, { userId }, id, input.version);
        return loadView(tx, userId, id);
      });
      return c.json(view);
    });
}
