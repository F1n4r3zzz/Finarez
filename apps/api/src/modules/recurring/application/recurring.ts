import {
  draftSchema,
  type OccurrenceView,
  type RecurringTemplate,
  type RuleView,
  type RunResult,
} from '@finanz/contracts';
import {
  type CurrencyCode,
  type Frequency,
  type LocalDate,
  nextOccurrence,
  parseLocalDate,
  type Schedule,
} from '@finanz/kernel';
import { and, asc, count, desc, eq, isNull, lte } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { uuidv7 } from '../../../platform/ids';
import {
  type AccountSummary,
  accountsById,
  checkDraft,
  type Draft,
  LedgerError,
  postTransaction,
} from '../../ledger';
import { occurrences, rules } from '../infra/schema';

/** An expected refusal; `code` is stable and translated by the UI. */
export class RecurringError extends Error {
  constructor(
    readonly code:
      | 'recurring.not_found'
      | 'recurring.not_pending'
      | 'recurring.ended'
      | 'recurring.next_in_past'
      | 'recurring.ends_before_next'
      | 'recurring.second_day'
      | 'recurring.amount_not_adjustable',
  ) {
    super(code);
    this.name = 'RecurringError';
  }
}

type RuleRow = typeof rules.$inferSelect;
type Repeating = Exclude<Draft, { kind: 'adjustment' }>;

/** Most dates one run takes (recorded or queued), so a long absence can't make a request slow. */
const RUN_LIMIT = 200;

const scheduleOf = (row: Pick<RuleRow, 'frequency' | 'anchorOn' | 'secondDay'>): Schedule => ({
  frequency: row.frequency,
  anchor: parseLocalDate(row.anchorOn),
  secondDay: row.secondDay,
});

const dayOfMonth = (date: LocalDate) => Number(date.slice(8, 10));

/** The draft stored as a template: wire format, without its date. */
function toTemplate(draft: Repeating): RecurringTemplate {
  const base = {
    description: draft.description,
    payee: draft.payee ?? null,
    notes: draft.notes ?? null,
  };
  if (draft.kind === 'transfer')
    return {
      ...base,
      kind: 'transfer',
      from: { accountId: draft.from.accountId, amountMinor: draft.from.amountMinor.toString() },
      to: { accountId: draft.to.accountId, amountMinor: draft.to.amountMinor.toString() },
      fee: draft.fee
        ? { amountMinor: draft.fee.amountMinor.toString(), categoryId: draft.fee.categoryId }
        : null,
    };
  return {
    ...base,
    kind: draft.kind,
    accountId: draft.accountId,
    lines: draft.lines.map((l) => ({
      categoryId: l.categoryId,
      amountMinor: l.amountMinor.toString(),
      memo: l.memo ?? null,
    })),
  };
}

/** The template as a draft for one date. */
function draftOn(template: RecurringTemplate, on: LocalDate): Repeating {
  return draftSchema.parse({ ...template, occurredOn: on }) as Repeating;
}

const accountIdsOf = (t: RecurringTemplate) =>
  t.kind === 'transfer' ? [t.from.accountId, t.to.accountId] : [t.accountId];

/** The one amount a template moves, if it has one, and the currency it is in. */
function amountOf(
  t: RecurringTemplate,
  accounts: ReadonlyMap<string, AccountSummary>,
): { amountMinor: bigint | null; currency: CurrencyCode } {
  if (t.kind === 'transfer') {
    const from = accounts.get(t.from.accountId);
    const to = accounts.get(t.to.accountId);
    const currency = from?.currency ?? ('COP' as CurrencyCode);
    return {
      amountMinor: from && to && from.currency === to.currency ? BigInt(t.from.amountMinor) : null,
      currency,
    };
  }
  const currency = accounts.get(t.accountId)?.currency ?? ('COP' as CurrencyCode);
  const [line, ...rest] = t.lines;
  return { amountMinor: line && rest.length === 0 ? BigInt(line.amountMinor) : null, currency };
}

/** The template moving `amount` instead (its sign kept for a refund line). */
function withAmount(
  t: RecurringTemplate,
  amount: bigint,
  accounts: ReadonlyMap<string, AccountSummary>,
): RecurringTemplate {
  if (amountOf(t, accounts).amountMinor === null)
    throw new RecurringError('recurring.amount_not_adjustable');
  const value = amount.toString();
  if (t.kind === 'transfer')
    return {
      ...t,
      from: { ...t.from, amountMinor: value },
      to: { ...t.to, amountMinor: value },
    };
  const [line] = t.lines;
  if (!line) throw new RecurringError('recurring.amount_not_adjustable');
  return {
    ...t,
    lines: [{ ...line, amountMinor: BigInt(line.amountMinor) < 0n ? `-${value}` : value }],
  };
}

async function accountsOf(tx: Executor, userId: string, templates: RecurringTemplate[]) {
  return accountsById(tx, userId, [...new Set(templates.flatMap(accountIdsOf))]);
}

export interface NewRule {
  /** The first movement: posted now when its date is today or earlier. */
  draft: Draft;
  frequency: Frequency;
  secondDay?: number | null;
  endsOn?: LocalDate | null;
  confirm?: boolean;
}

/**
 * Creates the rule from its first movement. A movement dated today or earlier is recorded now,
 * as the user's own entry, and the rule continues after today: dates between a back-dated
 * movement and today are not filled in. A future date is just the first time it happens.
 */
export async function createRule(
  tx: Executor,
  userId: string,
  input: NewRule,
  today: LocalDate,
): Promise<RuleRow> {
  const draft = input.draft;
  if (draft.kind === 'adjustment') throw new Error('Adjustments do not repeat');
  const first = draft.occurredOn;
  if (input.frequency === 'twice_monthly' && input.secondDay === dayOfMonth(first))
    throw new RecurringError('recurring.second_day');
  await checkDraft(tx, userId, draft);
  const schedule: Schedule = {
    frequency: input.frequency,
    anchor: first,
    secondDay: input.secondDay ?? null,
  };
  const postsNow = first <= today;
  const [row] = await tx
    .insert(rules)
    .values({
      userId,
      id: uuidv7(),
      template: toTemplate(draft),
      frequency: input.frequency,
      anchorOn: first,
      secondDay: schedule.secondDay,
      nextDueOn: postsNow ? nextOccurrence(schedule, today) : first,
      endsOn: input.endsOn ?? null,
      confirm: input.confirm ?? false,
    })
    .returning();
  if (!row) throw new Error('Insert returned no row');
  if (postsNow) {
    const transactionId = await postTransaction(tx, { userId }, draft);
    await tx
      .insert(occurrences)
      .values({ userId, ruleId: row.id, dueOn: first, status: 'posted', transactionId });
  }
  return row;
}

const isEnded = (row: RuleRow) =>
  row.endedAt !== null || (row.endsOn !== null && row.nextDueOn > row.endsOn);

/**
 * Records, or queues for the user, every date that is due by `today`. Each rule is held while
 * it runs and skipped by other runs meanwhile; the occurrence's primary key is the last guard,
 * so no date ever happens twice. An automatic one the ledger refuses (say, its account was
 * archived) waits for the user with the reason, and the others go on.
 */
export async function runDue(tx: Executor, userId: string, today: LocalDate): Promise<RunResult> {
  const due = await tx
    .select()
    .from(rules)
    .where(ownedBy(rules.userId, userId, isNull(rules.endedAt), lte(rules.nextDueOn, today)))
    .orderBy(asc(rules.nextDueOn))
    .for('update', { skipLocked: true });
  let budget = RUN_LIMIT;
  let posted = 0;
  for (const row of due) {
    const schedule = scheduleOf(row);
    const template = row.template as RecurringTemplate;
    let date = parseLocalDate(row.nextDueOn);
    while (date <= today && (!row.endsOn || date <= row.endsOn) && budget > 0) {
      const [claimed] = await tx
        .insert(occurrences)
        .values({ userId, ruleId: row.id, dueOn: date, status: 'pending' })
        .onConflictDoNothing()
        .returning({ dueOn: occurrences.dueOn });
      if (claimed) budget--;
      if (claimed && !row.confirm) {
        const on = date;
        try {
          await tx.transaction(async (sp) => {
            const transactionId = await postTransaction(
              sp,
              { userId, source: 'recurring' },
              draftOn(template, on),
            );
            await sp
              .update(occurrences)
              .set({ status: 'posted', transactionId, updatedAt: new Date() })
              .where(occurrenceKey(userId, row.id, on));
          });
          posted++;
        } catch (error) {
          if (!(error instanceof LedgerError)) throw error;
          await tx
            .update(occurrences)
            .set({ error: error.code, updatedAt: new Date() })
            .where(occurrenceKey(userId, row.id, on));
        }
      }
      date = nextOccurrence(schedule, date);
    }
    await tx
      .update(rules)
      .set({ nextDueOn: date, updatedAt: new Date() })
      .where(ownedBy(rules.userId, userId, eq(rules.id, row.id)));
  }
  const [waiting] = await tx
    .select({ n: count() })
    .from(occurrences)
    .where(ownedBy(occurrences.userId, userId, eq(occurrences.status, 'pending')));
  return { posted, pending: waiting?.n ?? 0 };
}

const occurrenceKey = (userId: string, ruleId: string, dueOn: string) =>
  ownedBy(occurrences.userId, userId, eq(occurrences.ruleId, ruleId), eq(occurrences.dueOn, dueOn));

async function lockRule(tx: Executor, userId: string, id: string): Promise<RuleRow> {
  const [row] = await tx
    .select()
    .from(rules)
    .where(ownedBy(rules.userId, userId, eq(rules.id, id)))
    .for('update');
  if (!row) throw new RecurringError('recurring.not_found');
  return row;
}

async function lockPending(tx: Executor, userId: string, ruleId: string, dueOn: LocalDate) {
  const [occurrence] = await tx
    .select()
    .from(occurrences)
    .where(occurrenceKey(userId, ruleId, dueOn))
    .for('update');
  if (!occurrence) throw new RecurringError('recurring.not_found');
  if (occurrence.status !== 'pending') throw new RecurringError('recurring.not_pending');
}

/** Records a waiting occurrence, on its date or another, with its amount or another. */
export async function confirmOccurrence(
  tx: Executor,
  userId: string,
  ruleId: string,
  dueOn: LocalDate,
  change: { amountMinor?: bigint; occurredOn?: LocalDate },
): Promise<void> {
  // The rule first, then the date: the order every path that takes both uses.
  const rule = await lockRule(tx, userId, ruleId);
  await lockPending(tx, userId, ruleId, dueOn);
  let template = rule.template as RecurringTemplate;
  if (change.amountMinor !== undefined)
    template = withAmount(template, change.amountMinor, await accountsOf(tx, userId, [template]));
  const transactionId = await postTransaction(
    tx,
    { userId, source: 'recurring' },
    draftOn(template, change.occurredOn ?? dueOn),
  );
  await tx
    .update(occurrences)
    .set({ status: 'posted', transactionId, error: null, updatedAt: new Date() })
    .where(occurrenceKey(userId, ruleId, dueOn));
}

/** A skipped date stays skipped: its row keeps any later run from bringing it back. */
export async function skipOccurrence(
  tx: Executor,
  userId: string,
  ruleId: string,
  dueOn: LocalDate,
): Promise<void> {
  await lockPending(tx, userId, ruleId, dueOn);
  await tx
    .update(occurrences)
    .set({ status: 'skipped', error: null, updatedAt: new Date() })
    .where(occurrenceKey(userId, ruleId, dueOn));
}

/** Skips the next date before it comes (a month without the gym). */
export async function skipNext(tx: Executor, userId: string, id: string): Promise<void> {
  const row = await lockRule(tx, userId, id);
  if (isEnded(row)) throw new RecurringError('recurring.ended');
  await tx
    .insert(occurrences)
    .values({ userId, ruleId: id, dueOn: row.nextDueOn, status: 'skipped' })
    .onConflictDoNothing();
  await tx
    .update(rules)
    .set({
      nextDueOn: nextOccurrence(scheduleOf(row), parseLocalDate(row.nextDueOn)),
      updatedAt: new Date(),
    })
    .where(ownedBy(rules.userId, userId, eq(rules.id, id)));
}

/** Stops the rule. What it recorded stays; what waits can still be confirmed or skipped. */
export async function endRule(tx: Executor, userId: string, id: string): Promise<void> {
  const row = await lockRule(tx, userId, id);
  if (row.endedAt) return;
  await tx
    .update(rules)
    .set({ endedAt: new Date(), updatedAt: new Date() })
    .where(ownedBy(rules.userId, userId, eq(rules.id, id)));
}

export interface RuleChange {
  description?: string;
  amountMinor?: bigint;
  frequency?: Frequency;
  secondDay?: number | null;
  nextDueOn?: LocalDate;
  endsOn?: LocalDate | null;
  confirm?: boolean;
}

/**
 * Changes what the rule records from now on; what it already recorded stays as it was. A new
 * schedule or next date starts from that date, which can't be in the past.
 */
export async function updateRule(
  tx: Executor,
  userId: string,
  id: string,
  change: RuleChange,
  today: LocalDate,
): Promise<void> {
  const row = await lockRule(tx, userId, id);
  if (row.endedAt) throw new RecurringError('recurring.ended');
  let template = row.template as RecurringTemplate;
  if (change.description !== undefined) template = { ...template, description: change.description };
  if (change.amountMinor !== undefined)
    template = withAmount(template, change.amountMinor, await accountsOf(tx, userId, [template]));

  const frequency = change.frequency ?? row.frequency;
  const secondDay =
    change.secondDay !== undefined
      ? change.secondDay
      : frequency === 'twice_monthly'
        ? row.secondDay
        : null;
  const rescheduled =
    change.frequency !== undefined ||
    change.secondDay !== undefined ||
    change.nextDueOn !== undefined;
  const next = change.nextDueOn ?? parseLocalDate(row.nextDueOn);
  if (rescheduled && next < today) throw new RecurringError('recurring.next_in_past');
  if (
    (frequency === 'twice_monthly') !== (secondDay != null) ||
    (secondDay != null && secondDay === dayOfMonth(next))
  )
    throw new RecurringError('recurring.second_day');
  const endsOn = change.endsOn !== undefined ? change.endsOn : row.endsOn;
  if (endsOn && endsOn < next) throw new RecurringError('recurring.ends_before_next');
  // The ledger checks the template again, so a later run never meets a broken draft.
  await checkDraft(tx, userId, draftOn(template, next));

  await tx
    .update(rules)
    .set({
      template,
      frequency,
      secondDay,
      ...(rescheduled ? { anchorOn: next, nextDueOn: next } : {}),
      endsOn,
      confirm: change.confirm ?? row.confirm,
      version: row.version + 1,
      updatedAt: new Date(),
    })
    .where(ownedBy(rules.userId, userId, eq(rules.id, id)));
}

/** The user's rules (or the one with `id`): active ones by next date, then ended ones. */
export async function ruleViews(tx: Executor, userId: string, id?: string): Promise<RuleView[]> {
  const rows = await tx
    .select()
    .from(rules)
    .where(ownedBy(rules.userId, userId, id ? eq(rules.id, id) : undefined))
    .orderBy(asc(rules.nextDueOn));
  if (rows.length === 0) return [];
  const accounts = await accountsOf(
    tx,
    userId,
    rows.map((r) => r.template as RecurringTemplate),
  );
  const waiting = await tx
    .select({ ruleId: occurrences.ruleId, n: count() })
    .from(occurrences)
    .where(ownedBy(occurrences.userId, userId, eq(occurrences.status, 'pending')))
    .groupBy(occurrences.ruleId);
  const pending = new Map(waiting.map((w) => [w.ruleId, w.n]));
  const views = rows.map((row): RuleView => {
    const template = row.template as RecurringTemplate;
    const { amountMinor, currency } = amountOf(template, accounts);
    return {
      id: row.id,
      template,
      frequency: row.frequency,
      anchorOn: parseLocalDate(row.anchorOn),
      secondDay: row.secondDay,
      nextDueOn: parseLocalDate(row.nextDueOn),
      endsOn: row.endsOn ? parseLocalDate(row.endsOn) : null,
      confirm: row.confirm,
      ended: isEnded(row),
      pending: pending.get(row.id) ?? 0,
      amountMinor: amountMinor?.toString() ?? null,
      currency,
    };
  });
  return [...views.filter((v) => !v.ended), ...views.filter((v) => v.ended)];
}

/** Occurrences waiting for the user (all rules), or one rule's latest dates. */
export async function occurrenceViews(
  tx: Executor,
  userId: string,
  filter: { ruleId: string } | { pending: true },
): Promise<OccurrenceView[]> {
  const rows = await tx
    .select({ occurrence: occurrences, template: rules.template })
    .from(occurrences)
    .innerJoin(rules, and(eq(rules.userId, occurrences.userId), eq(rules.id, occurrences.ruleId)))
    .where(
      ownedBy(
        occurrences.userId,
        userId,
        'ruleId' in filter
          ? eq(occurrences.ruleId, filter.ruleId)
          : eq(occurrences.status, 'pending'),
      ),
    )
    .orderBy('ruleId' in filter ? desc(occurrences.dueOn) : asc(occurrences.dueOn))
    .limit(100);
  const accounts = await accountsOf(
    tx,
    userId,
    rows.map((r) => r.template as RecurringTemplate),
  );
  return rows.map(({ occurrence: o, template }) => {
    const t = template as RecurringTemplate;
    const { amountMinor, currency } = amountOf(t, accounts);
    return {
      ruleId: o.ruleId,
      dueOn: parseLocalDate(o.dueOn),
      status: o.status,
      transactionId: o.transactionId,
      error: o.error,
      description: t.description,
      amountMinor: amountMinor?.toString() ?? null,
      currency,
    };
  });
}
