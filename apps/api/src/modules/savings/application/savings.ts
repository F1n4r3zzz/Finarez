import type { AllocationView, GoalView, SavingsAccountView } from '@finanz/contracts';
import {
  type CurrencyCode,
  convertMinor,
  type LocalDate,
  minorUnits,
  parseCurrencyCode,
  parseLocalDate,
} from '@finanz/kernel';
import { desc, eq, isNull } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { uuidv7 } from '../../../platform/ids';
import { loadRateBook, type RateBook } from '../../currency';
import {
  type Actor,
  accountsById,
  balancesAsOf,
  getTransaction,
  postTransaction,
  voidTransaction,
} from '../../ledger';
import { monthlyNeeded, monthsLeft, savingUnit } from '../domain/progress';
import { allocations, goals } from '../infra/schema';

/** An expected refusal; `code` is stable and translated by the UI. */
export class SavingsError extends Error {
  constructor(
    readonly code:
      | 'savings.goal_not_found'
      | 'savings.allocation_not_found'
      | 'savings.duplicate_name'
      | 'savings.goal_archived'
      | 'savings.goal_not_empty'
      | 'savings.account'
      | 'savings.same_account'
      | 'savings.transfer_currency'
      | 'savings.withdraw_exceeds'
      | 'savings.void_breaks_balance',
  ) {
    super(code);
    this.name = 'SavingsError';
  }
}

export type GoalRow = typeof goals.$inferSelect;
type AllocationRow = typeof allocations.$inferSelect;

async function withNameCheck<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
    const { code, constraint } = cause as { code?: string; constraint?: string };
    if (code === '23505' && constraint === 'goals_unique_name')
      throw new SavingsError('savings.duplicate_name');
    throw error;
  }
}

export interface NewGoal {
  name: string;
  currency: CurrencyCode;
  targetMinor: bigint;
  targetDate?: LocalDate | null;
}

export function createGoal(tx: Executor, userId: string, input: NewGoal): Promise<GoalRow> {
  return withNameCheck(async () => {
    const [row] = await tx
      .insert(goals)
      .values({
        userId,
        id: uuidv7(),
        name: input.name,
        currency: input.currency,
        targetMinor: input.targetMinor,
        targetDate: input.targetDate ?? null,
      })
      .returning();
    if (!row) throw new Error('Insert returned no row');
    return row;
  });
}

export async function getGoal(
  tx: Executor,
  userId: string,
  id: string,
  { lock = false } = {},
): Promise<GoalRow> {
  const query = tx
    .select()
    .from(goals)
    .where(ownedBy(goals.userId, userId, eq(goals.id, id)));
  // Changes to one goal's money take turns, so a withdrawal can't race a void.
  const [row] = lock ? await query.for('update') : await query;
  if (!row) throw new SavingsError('savings.goal_not_found');
  return row;
}

export function updateGoal(
  tx: Executor,
  userId: string,
  id: string,
  input: { name?: string; targetMinor?: bigint; targetDate?: LocalDate | null },
): Promise<void> {
  return withNameCheck(async () => {
    await getGoal(tx, userId, id);
    if (Object.keys(input).length === 0) return;
    await tx
      .update(goals)
      .set({ ...input, updatedAt: new Date() })
      .where(ownedBy(goals.userId, userId, eq(goals.id, id)));
  });
}

/** What each account holds for one goal right now (active allocations), in its currency. */
async function heldByAccount(tx: Executor, userId: string, goalId: string) {
  const rows = await tx
    .select()
    .from(allocations)
    .where(
      ownedBy(
        allocations.userId,
        userId,
        eq(allocations.goalId, goalId),
        isNull(allocations.voidedAt),
      ),
    );
  const held = new Map<string, { currency: CurrencyCode; amountMinor: bigint }>();
  for (const r of rows) {
    const entry = held.get(r.accountId) ?? {
      currency: parseCurrencyCode(r.currency),
      amountMinor: 0n,
    };
    entry.amountMinor += r.amountMinor;
    held.set(r.accountId, entry);
  }
  return held;
}

/** Archiving needs the goal emptied first, so no account keeps money set aside for it. */
export async function archiveGoal(tx: Executor, userId: string, id: string): Promise<void> {
  await getGoal(tx, userId, id, { lock: true });
  const held = await heldByAccount(tx, userId, id);
  if ([...held.values()].some((h) => h.amountMinor !== 0n))
    throw new SavingsError('savings.goal_not_empty');
  await tx
    .update(goals)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(ownedBy(goals.userId, userId, eq(goals.id, id)));
}

export interface NewAllocation {
  direction: 'contribute' | 'withdraw';
  accountId: string;
  amountMinor: bigint;
  occurredOn: LocalDate;
  fromAccountId?: string;
  note?: string;
}

/**
 * Sets money aside for a goal, or releases it. A contribution can also move the money first
 * (`fromAccountId`): Finanz records that transfer as its own, savings-managed movement.
 * Releasing never takes out more than the goal holds in that account.
 */
export async function allocate(
  tx: Executor,
  actor: Actor,
  goalId: string,
  input: NewAllocation,
): Promise<AllocationRow> {
  const { userId } = actor;
  const goal = await getGoal(tx, userId, goalId, { lock: true });
  if (goal.archivedAt) throw new SavingsError('savings.goal_archived');
  const ids = [input.accountId, ...(input.fromAccountId ? [input.fromAccountId] : [])];
  const found = await accountsById(tx, userId, ids);
  const account = found.get(input.accountId);
  const usable = (a: typeof account, allowArchived: boolean) =>
    a !== undefined &&
    a.kind === 'asset' &&
    a.systemRole === null &&
    (allowArchived || !a.archived);
  // Money can still be released from an archived account, never set aside in one.
  if (!account || !usable(account, input.direction === 'withdraw'))
    throw new SavingsError('savings.account');

  let transactionId: string | null = null;
  if (input.direction === 'withdraw') {
    const held = (await heldByAccount(tx, userId, goalId)).get(input.accountId)?.amountMinor ?? 0n;
    if (input.amountMinor > held) throw new SavingsError('savings.withdraw_exceeds');
  } else if (input.fromAccountId) {
    const from = found.get(input.fromAccountId);
    if (!from || !usable(from, false)) throw new SavingsError('savings.account');
    if (from.id === account.id) throw new SavingsError('savings.same_account');
    if (from.currency !== account.currency) throw new SavingsError('savings.transfer_currency');
    transactionId = await postTransaction(
      tx,
      { ...actor, module: 'savings' },
      {
        kind: 'transfer',
        occurredOn: input.occurredOn,
        description: `Aporte — ${goal.name}`,
        from: { accountId: from.id, amountMinor: input.amountMinor },
        to: { accountId: account.id, amountMinor: input.amountMinor },
      },
      { managedBy: 'savings' },
    );
  }

  const [row] = await tx
    .insert(allocations)
    .values({
      userId,
      id: uuidv7(),
      goalId,
      accountId: account.id,
      currency: account.currency,
      accountKind: 'asset',
      amountMinor: input.direction === 'withdraw' ? -input.amountMinor : input.amountMinor,
      occurredOn: input.occurredOn,
      transactionId,
      note: input.note ?? null,
    })
    .returning();
  if (!row) throw new Error('Insert returned no row');
  return row;
}

/**
 * Undoes an allocation, and the transfer it recorded if it moved money. Undoing a contribution
 * the goal has already released (the account would hold less than nothing) is refused.
 */
export async function voidAllocation(
  tx: Executor,
  actor: Actor,
  goalId: string,
  allocationId: string,
): Promise<void> {
  const { userId } = actor;
  await getGoal(tx, userId, goalId, { lock: true });
  const [row] = await tx
    .select()
    .from(allocations)
    .where(
      ownedBy(
        allocations.userId,
        userId,
        eq(allocations.goalId, goalId),
        eq(allocations.id, allocationId),
      ),
    );
  if (!row || row.voidedAt) throw new SavingsError('savings.allocation_not_found');
  const held = (await heldByAccount(tx, userId, goalId)).get(row.accountId)?.amountMinor ?? 0n;
  if (held - row.amountMinor < 0n) throw new SavingsError('savings.void_breaks_balance');
  if (row.transactionId) {
    const transfer = await getTransaction(tx, userId, row.transactionId);
    if (transfer && transfer.header.status === 'posted')
      await voidTransaction(
        tx,
        { ...actor, module: 'savings' },
        row.transactionId,
        transfer.header.version,
      );
  }
  await tx
    .update(allocations)
    .set({ voidedAt: new Date() })
    .where(ownedBy(allocations.userId, userId, eq(allocations.id, allocationId)));
}

export async function listAllocations(
  tx: Executor,
  userId: string,
  goalId: string,
): Promise<AllocationView[]> {
  await getGoal(tx, userId, goalId);
  const rows = await tx
    .select()
    .from(allocations)
    .where(ownedBy(allocations.userId, userId, eq(allocations.goalId, goalId)))
    .orderBy(desc(allocations.occurredOn), desc(allocations.createdAt));
  return rows.map((r) => ({
    id: r.id,
    goalId: r.goalId,
    accountId: r.accountId,
    amountMinor: r.amountMinor.toString(),
    occurredOn: parseLocalDate(r.occurredOn),
    note: r.note,
    transactionId: r.transactionId,
    voided: r.voidedAt !== null,
  }));
}

/** Amounts in another currency, at the rate for `on`; undefined when no rate is known. */
function converter(book: RateBook, on: LocalDate) {
  return (amountMinor: bigint, from: CurrencyCode, to: CurrencyCode): bigint | undefined => {
    if (from === to) return amountMinor;
    const quote = book.find(from, to, on);
    if (!quote) return undefined;
    return convertMinor(amountMinor, minorUnits(from), minorUnits(to), quote.rate);
  };
}

/** Every goal with its progress in its own currency at today's rates (data-model §7). */
export async function goalViews(
  tx: Executor,
  userId: string,
  today: LocalDate,
  only?: string,
): Promise<GoalView[]> {
  const rows = await tx
    .select()
    .from(goals)
    .where(ownedBy(goals.userId, userId, only ? eq(goals.id, only) : undefined))
    .orderBy(goals.createdAt);
  if (rows.length === 0) return [];
  const convert = converter(await loadRateBook(tx, userId), today);
  const views: GoalView[] = [];
  for (const goal of rows) {
    const currency = parseCurrencyCode(goal.currency);
    const held = await heldByAccount(tx, userId, goal.id);
    let saved = 0n;
    const excluded: GoalView['excluded'] = [];
    for (const [accountId, h] of held) {
      const value = convert(h.amountMinor, h.currency, currency);
      if (value === undefined)
        excluded.push({
          date: today,
          currency: h.currency,
          component: `allocation:${accountId}`,
          amountMinor: h.amountMinor.toString(),
        });
      else saved += value;
    }
    const target = goal.targetDate ? parseLocalDate(goal.targetDate) : null;
    views.push({
      id: goal.id,
      name: goal.name,
      currency,
      targetMinor: goal.targetMinor.toString(),
      targetDate: target,
      archived: goal.archivedAt !== null,
      savedMinor: saved.toString(),
      byAccount: [...held]
        .filter(([, h]) => h.amountMinor !== 0n)
        .map(([accountId, h]) => ({ accountId, amountMinor: h.amountMinor.toString() })),
      monthlyNeededMinor: target
        ? monthlyNeeded(
            goal.targetMinor,
            saved,
            monthsLeft(today, target),
            savingUnit(currency),
          ).toString()
        : null,
      excluded,
    });
  }
  return views;
}

/**
 * Each asset account's balance today, what is set aside in it for goals and what is left.
 * Over-allocation is shown, never blocked: balances move with spending (data-model §7).
 */
export async function savingsAccounts(
  tx: Executor,
  userId: string,
  today: LocalDate,
): Promise<SavingsAccountView[]> {
  const balances = (await balancesAsOf(tx, userId, today)).filter((b) => b.kind === 'asset');
  const rows = await tx
    .select({ accountId: allocations.accountId, amountMinor: allocations.amountMinor })
    .from(allocations)
    .where(ownedBy(allocations.userId, userId, isNull(allocations.voidedAt)));
  const allocated = new Map<string, bigint>();
  for (const r of rows)
    allocated.set(r.accountId, (allocated.get(r.accountId) ?? 0n) + r.amountMinor);
  const accounts = await accountsById(
    tx,
    userId,
    balances.map((b) => b.accountId),
  );
  return balances
    .filter((b) => accounts.get(b.accountId)?.systemRole === null)
    .map((b) => {
      const set = allocated.get(b.accountId) ?? 0n;
      return {
        accountId: b.accountId,
        currency: b.currency,
        balanceMinor: b.balanceMinor.toString(),
        allocatedMinor: set.toString(),
        availableMinor: (b.balanceMinor - set).toString(),
      };
    });
}
