import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { uuidv7 } from '../../../platform/ids';
import type { AUDIT_SOURCES, ManagingModule } from '../domain/kinds';
import {
  type Draft,
  LedgerError,
  type PlannedEntry,
  type PlannedTransaction,
  planTransaction,
} from '../domain/posting';
import { entries, transactionAudit, transactions } from '../infra/schema';
import {
  accountIdOf,
  type EntryRow,
  entriesOf,
  insertEntries,
  loadPostingContext,
  resolveSystemAccounts,
  type Snapshot,
  snapshot,
  type TransactionRow,
} from './store';

/** Who is acting: the user through the UI, or a module that manages the transaction. */
export interface Actor {
  userId: string;
  /** Set when a managing module (debts, savings…) changes its own transaction. */
  module?: ManagingModule;
}

type AuditSource = (typeof AUDIT_SOURCES)[number];

function draftIds(draft: Draft): { accounts: string[]; categories: string[] } {
  switch (draft.kind) {
    case 'expense':
    case 'income':
      return { accounts: [draft.accountId], categories: draft.lines.map((l) => l.categoryId) };
    case 'transfer':
      return {
        accounts: [draft.from.accountId, draft.to.accountId],
        categories: draft.fee ? [draft.fee.categoryId] : [],
      };
    case 'adjustment':
      return { accounts: [draft.accountId], categories: [draft.categoryId] };
  }
}

async function plan(tx: Executor, userId: string, draft: Draft) {
  const ids = draftIds(draft);
  const ctx = await loadPostingContext(tx, userId, ids.accounts, ids.categories);
  const planned = planTransaction(draft, ctx);
  const system = await resolveSystemAccounts(
    tx,
    userId,
    planned.entries.map((e) => e.account),
  );
  return {
    planned,
    entries: planned.entries.map((e) => ({ ...e, accountId: accountIdOf(e.account, system) })),
  };
}

async function audit(
  tx: Executor,
  actor: Actor,
  transactionId: string,
  version: number,
  action: 'create' | 'update' | 'void' | 'restore',
  before: Snapshot | null,
  after: Snapshot | null,
  reconciledChange = false,
): Promise<void> {
  const source: AuditSource = actor.module === 'imports' ? 'import' : (actor.module ?? 'ui');
  await tx.insert(transactionAudit).values({
    userId: actor.userId,
    id: uuidv7(),
    transactionId,
    version,
    action,
    source,
    actorUserId: actor.userId,
    before,
    after,
    reconciledChange,
  });
}

async function headerOf(
  tx: Executor,
  userId: string,
  id: string,
): Promise<TransactionRow | undefined> {
  const [row] = await tx
    .select()
    .from(transactions)
    .where(ownedBy(transactions.userId, userId, eq(transactions.id, id)));
  return row;
}

/** Records a new posted transaction (or one prepared by a managing module) and its history. */
export async function postTransaction(
  tx: Executor,
  actor: Actor,
  input: PlannedTransaction | Draft,
  options: { managedBy?: ManagingModule } = {},
): Promise<string> {
  const { planned, entries: lines } =
    'entries' in input
      ? { planned: input, entries: await resolveEntries(tx, actor.userId, input.entries) }
      : await plan(tx, actor.userId, input);
  const id = uuidv7();
  const [header] = await tx
    .insert(transactions)
    .values({
      userId: actor.userId,
      id,
      occurredOn: planned.occurredOn,
      kind: planned.kind,
      status: 'posted',
      managedBy: options.managedBy ?? null,
      description: planned.description,
      payee: planned.payee,
      notes: planned.notes,
    })
    .returning();
  if (!header) throw new Error('Insert returned no row');
  await insertEntries(tx, actor.userId, id, planned.occurredOn, lines);
  await audit(
    tx,
    actor,
    id,
    1,
    'create',
    null,
    snapshot(header, await entriesOf(tx, actor.userId, id)),
  );
  return id;
}

async function resolveEntries(tx: Executor, userId: string, planned: readonly PlannedEntry[]) {
  const system = await resolveSystemAccounts(
    tx,
    userId,
    planned.map((e) => e.account),
  );
  return planned.map((e) => ({ ...e, accountId: accountIdOf(e.account, system) }));
}

/**
 * Step 1 of every change (data-model §4.5): lock the header and check the version, changing
 * nothing else, so the original date and entries are still intact for the audit and the diff.
 */
async function lockVersion(
  tx: Executor,
  actor: Actor,
  id: string,
  expectedVersion: number,
): Promise<TransactionRow> {
  const [locked] = await tx
    .update(transactions)
    .set({ version: expectedVersion + 1, updatedAt: new Date() })
    .where(
      ownedBy(
        transactions.userId,
        actor.userId,
        and(eq(transactions.id, id), eq(transactions.version, expectedVersion)),
      ),
    )
    .returning();
  if (!locked) {
    throw new LedgerError(
      (await headerOf(tx, actor.userId, id)) ? 'ledger.stale_version' : 'ledger.not_found',
    );
  }
  if (locked.managedBy !== null && locked.managedBy !== actor.module) {
    throw new LedgerError('ledger.managed_transaction', locked.managedBy);
  }
  return { ...locked, version: expectedVersion };
}

const sameLine = (a: EntryRow, b: PlannedEntry & { accountId: string }) =>
  a.accountId === b.accountId &&
  a.currency === b.currency &&
  a.amountMinor === b.amountMinor &&
  a.categoryId === b.categoryId;

export interface EditOptions {
  /** The user confirmed changing lines already reconciled with a statement. */
  confirmReconciledChange?: boolean;
}

/** Replaces a posted transaction's content, keeping unchanged lines and their reconciliation. */
export async function editTransaction(
  tx: Executor,
  actor: Actor,
  id: string,
  expectedVersion: number,
  draft: Draft,
  options: EditOptions = {},
): Promise<void> {
  const before = await lockVersion(tx, actor, id, expectedVersion);
  if (before.status !== 'posted') throw new LedgerError('ledger.already_void');
  const oldEntries = await entriesOf(tx, actor.userId, id);
  const { planned, entries: wanted } = await plan(tx, actor.userId, draft);

  // A date change touches every line (reconciliation certified the old date).
  const dateChanged = planned.occurredOn !== before.occurredOn;
  const remaining = [...oldEntries];
  // Kept lines keep their id and reconciliation; only their note (memo) may still change.
  const renotes: { id: string; memo: string | null }[] = [];
  const added: typeof wanted = [];
  for (const line of wanted) {
    const match = dateChanged ? -1 : remaining.findIndex((old) => sameLine(old, line));
    const [old] = match >= 0 ? remaining.splice(match, 1) : [];
    if (!old) added.push(line);
    else if (old.memo !== line.memo) renotes.push({ id: old.id, memo: line.memo });
  }
  const removed = remaining;
  const reconciledChange = removed.some((e) => e.reconciledAt !== null);
  if (reconciledChange && !options.confirmReconciledChange) {
    throw new LedgerError('ledger.reconciled_change');
  }

  if (removed.length) {
    await tx.delete(entries).where(
      ownedBy(
        entries.userId,
        actor.userId,
        inArray(
          entries.id,
          removed.map((e) => e.id),
        ),
      ),
    );
  }
  await tx
    .update(transactions)
    .set({
      occurredOn: planned.occurredOn,
      kind: planned.kind,
      description: planned.description,
      payee: planned.payee,
      notes: planned.notes,
    })
    .where(ownedBy(transactions.userId, actor.userId, eq(transactions.id, id)));
  for (const { id: entryId, memo } of renotes) {
    await tx
      .update(entries)
      .set({ memo })
      .where(ownedBy(entries.userId, actor.userId, eq(entries.id, entryId)));
  }
  await insertEntries(tx, actor.userId, id, planned.occurredOn, added);
  const after = await headerOf(tx, actor.userId, id);
  if (!after) throw new Error('Transaction vanished during edit');
  await audit(
    tx,
    actor,
    id,
    expectedVersion + 1,
    'update',
    snapshot(before, oldEntries),
    snapshot(after, await entriesOf(tx, actor.userId, id)),
    reconciledChange,
  );
}

/** Removes a transaction's effect: its entries go (the history keeps them), the record stays. */
export async function voidTransaction(
  tx: Executor,
  actor: Actor,
  id: string,
  expectedVersion: number,
  options: EditOptions = {},
): Promise<void> {
  const before = await lockVersion(tx, actor, id, expectedVersion);
  if (before.status !== 'posted') throw new LedgerError('ledger.already_void');
  const oldEntries = await entriesOf(tx, actor.userId, id);
  const reconciledChange = oldEntries.some((e) => e.reconciledAt !== null);
  if (reconciledChange && !options.confirmReconciledChange) {
    throw new LedgerError('ledger.reconciled_change');
  }
  await tx
    .delete(entries)
    .where(ownedBy(entries.userId, actor.userId, eq(entries.transactionId, id)));
  const [after] = await tx
    .update(transactions)
    .set({ status: 'void' })
    .where(ownedBy(transactions.userId, actor.userId, eq(transactions.id, id)))
    .returning();
  if (!after) throw new Error('Transaction vanished during void');
  await audit(
    tx,
    actor,
    id,
    expectedVersion + 1,
    'void',
    snapshot(before, oldEntries),
    snapshot(after, []),
    reconciledChange,
  );
}

/** Brings a voided transaction back with the entries it had (unreconciled). */
export async function restoreTransaction(
  tx: Executor,
  actor: Actor,
  id: string,
  expectedVersion: number,
): Promise<void> {
  const before = await lockVersion(tx, actor, id, expectedVersion);
  if (before.status !== 'void') throw new LedgerError('ledger.not_void');
  const [lastVoid] = await tx
    .select({ before: transactionAudit.before })
    .from(transactionAudit)
    .where(
      ownedBy(
        transactionAudit.userId,
        actor.userId,
        and(eq(transactionAudit.transactionId, id), eq(transactionAudit.action, 'void')),
      ),
    )
    .orderBy(desc(transactionAudit.version))
    .limit(1);
  const previous = lastVoid?.before as Snapshot | null | undefined;
  if (!previous) throw new Error('No snapshot to restore');
  const [after] = await tx
    .update(transactions)
    .set({ status: 'posted', occurredOn: previous.header.occurredOn })
    .where(ownedBy(transactions.userId, actor.userId, eq(transactions.id, id)))
    .returning();
  if (!after) throw new Error('Transaction vanished during restore');
  await insertEntries(
    tx,
    actor.userId,
    id,
    after.occurredOn,
    previous.entries.map((e) => ({
      account: { accountId: e.accountId },
      accountId: e.accountId,
      accountKind: e.accountKind as PlannedEntry['accountKind'],
      currency: e.currency as PlannedEntry['currency'],
      amountMinor: BigInt(e.amountMinor),
      categoryId: e.categoryId,
      memo: e.memo,
    })),
  );
  await audit(
    tx,
    actor,
    id,
    expectedVersion + 1,
    'restore',
    snapshot(before, []),
    snapshot(after, await entriesOf(tx, actor.userId, id)),
  );
}

export async function getTransaction(tx: Executor, userId: string, id: string) {
  const header = await headerOf(tx, userId, id);
  if (!header) return undefined;
  return { header, entries: await entriesOf(tx, userId, id) };
}
