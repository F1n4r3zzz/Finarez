import type { DebtView, PaymentView } from '@finanz/contracts';
import {
  type CurrencyCode,
  type ExactRate,
  type LocalDate,
  parseCurrencyCode,
  parseLocalDate,
  parseRate,
} from '@finanz/kernel';
import { and, asc, eq } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { uuidv7 } from '../../../platform/ids';
import { categoriesTable, ensureDefaultCategories } from '../../categories';
import {
  type Actor,
  accountsById,
  balancesAsOf,
  createAccount,
  type EntryRow,
  editTransaction,
  entriesOf,
  getTransaction,
  type PlannedEntry,
  type PlannedTransaction,
  postTransaction,
  voidTransaction,
} from '../../ledger';
import { type DebtRate, monthlyFromAnnual, proposeSplit, ZERO_RATE } from '../domain/schedule';
import { debtPayments, debts } from '../infra/schema';

/** An expected refusal; `code` is stable and translated by the UI. */
export class DebtError extends Error {
  constructor(
    readonly code:
      | 'debt.not_found'
      | 'debt.payment_not_found'
      | 'debt.source_account'
      | 'debt.currency_mismatch'
      | 'debt.split_exceeds_payment'
      | 'debt.overpayment'
      | 'debt.interest_category_missing'
      | 'debt.fee_category',
  ) {
    super(code);
    this.name = 'DebtError';
  }
}

export type DebtRow = typeof debts.$inferSelect;

/** Interest for one month, whatever period the rate was given in. */
export function monthlyRate(debt: Pick<DebtRow, 'rate' | 'ratePeriod'>): DebtRate {
  if (debt.rate === null || debt.ratePeriod === null) return ZERO_RATE;
  const canonical = debt.rate.includes('.') ? debt.rate.replace(/\.?0+$/, '') : debt.rate;
  if (/^0*(\.0*)?$/.test(canonical) || canonical === '') return ZERO_RATE;
  const exact: ExactRate = parseRate(canonical);
  return debt.ratePeriod === 'annual' ? monthlyFromAnnual(exact) : exact;
}

/** Lenders in Colombia round to whole pesos; elsewhere to cents. */
const defaultRounding = (currency: CurrencyCode) => (currency === 'COP' ? 100 : 1);

/** A default expense category by name ("Intereses", "Comisiones bancarias"), if the user kept it. */
async function expenseCategoryNamed(
  tx: Executor,
  userId: string,
  name: string,
): Promise<string | null> {
  // Defaults are created on first use; a debt may be the first thing that needs them.
  await ensureDefaultCategories(tx, userId);
  const [row] = await tx
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(
      ownedBy(
        categoriesTable.userId,
        userId,
        and(eq(categoriesTable.kind, 'expense'), eq(categoriesTable.name, name)),
      ),
    );
  return row?.id ?? null;
}

export interface NewDebt {
  name: string;
  type: 'loan' | 'credit_card';
  currency: CurrencyCode;
  institution?: string | null;
  openedOn: LocalDate;
  outstandingMinor: bigint;
  rate?: string | null;
  ratePeriod?: 'monthly' | 'annual' | null;
  originalPrincipalMinor?: bigint | null;
  termMonths?: number | null;
  installmentMinor?: bigint | null;
  startOn?: LocalDate | null;
  dueDay?: number | null;
  statementDay?: number | null;
  creditLimitMinor?: bigint | null;
  interestCategoryId?: string | null;
}

/** Creates the liability account (with what is owed as its opening balance) and its terms. */
export async function createDebt(tx: Executor, actor: Actor, input: NewDebt): Promise<DebtRow> {
  const account = await createAccount(tx, actor, {
    name: input.name,
    subtype: input.type,
    currency: input.currency,
    institution: input.institution ?? null,
    openedOn: input.openedOn,
    openingBalanceMinor: input.outstandingMinor === 0n ? undefined : -input.outstandingMinor,
  });
  const [row] = await tx
    .insert(debts)
    .values({
      userId: actor.userId,
      id: uuidv7(),
      accountId: account.id,
      currency: input.currency,
      accountKind: 'liability',
      type: input.type,
      rate: input.rate ?? null,
      ratePeriod: input.rate ? (input.ratePeriod ?? 'monthly') : null,
      originalPrincipalMinor: input.originalPrincipalMinor ?? null,
      termMonths: input.termMonths ?? null,
      installmentMinor: input.installmentMinor ?? null,
      startOn: input.startOn ?? null,
      dueDay: input.dueDay ?? null,
      statementDay: input.statementDay ?? null,
      creditLimitMinor: input.creditLimitMinor ?? null,
      interestCategoryId:
        input.interestCategoryId ?? (await expenseCategoryNamed(tx, actor.userId, 'Intereses')),
      roundingMinor: defaultRounding(input.currency),
    })
    .returning();
  if (!row) throw new Error('Insert returned no row');
  return row;
}

export async function getDebt(tx: Executor, userId: string, id: string): Promise<DebtRow> {
  const [row] = await tx
    .select()
    .from(debts)
    .where(ownedBy(debts.userId, userId, eq(debts.id, id)));
  if (!row) throw new DebtError('debt.not_found');
  return row;
}

/** The next due date on or after `today` for a debt paid on `dueDay` of each month. */
export function nextDue(dueDay: number | null, today: LocalDate): LocalDate | null {
  if (!dueDay) return null;
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const candidate = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1, Math.min(dueDay, last)));
  };
  let due = candidate(y, m);
  if (due.getUTCDate() < d) due = candidate(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
  return parseLocalDate(due.toISOString().slice(0, 10));
}

/** What is owed (positive) on each debt at the end of `on`. */
async function outstandingOf(tx: Executor, userId: string, rows: DebtRow[], on: LocalDate) {
  const balances = await balancesAsOf(
    tx,
    userId,
    on,
    rows.map((r) => r.accountId),
  );
  return new Map(balances.map((b) => [b.accountId, -b.balanceMinor]));
}

export async function listDebts(
  tx: Executor,
  userId: string,
  today: LocalDate,
): Promise<DebtView[]> {
  const rows = await tx
    .select()
    .from(debts)
    .where(ownedBy(debts.userId, userId))
    .orderBy(asc(debts.createdAt));
  const owed = await outstandingOf(tx, userId, rows, today);
  const accounts = await accountsById(
    tx,
    userId,
    rows.map((r) => r.accountId),
  );
  return rows.map((r) =>
    debtView(r, owed.get(r.accountId) ?? 0n, accounts.get(r.accountId), today),
  );
}

export function debtView(
  r: DebtRow,
  outstanding: bigint,
  account: { name: string; archived: boolean } | undefined,
  today: LocalDate,
): DebtView {
  const s = (v: bigint | null) => (v === null ? null : v.toString());
  return {
    id: r.id,
    accountId: r.accountId,
    name: account?.name ?? '',
    type: r.type,
    currency: parseCurrencyCode(r.currency),
    outstandingMinor: outstanding.toString(),
    rate: r.rate === null ? null : r.rate.replace(/\.?0+$/, ''),
    ratePeriod: r.ratePeriod,
    originalPrincipalMinor: s(r.originalPrincipalMinor),
    termMonths: r.termMonths,
    installmentMinor: s(r.installmentMinor),
    startOn: r.startOn === null ? null : parseLocalDate(r.startOn),
    dueDay: r.dueDay,
    statementDay: r.statementDay,
    creditLimitMinor: s(r.creditLimitMinor),
    interestCategoryId: r.interestCategoryId,
    nextDueOn: nextDue(r.dueDay, today),
    archived: account?.archived ?? false,
  };
}

export async function updateDebt(
  tx: Executor,
  userId: string,
  id: string,
  changes: Partial<
    Omit<NewDebt, 'name' | 'type' | 'currency' | 'openedOn' | 'outstandingMinor' | 'institution'>
  >,
): Promise<DebtRow> {
  const set: Partial<typeof debts.$inferInsert> = { updatedAt: new Date() };
  for (const key of [
    'rate',
    'ratePeriod',
    'originalPrincipalMinor',
    'termMonths',
    'installmentMinor',
    'startOn',
    'dueDay',
    'statementDay',
    'creditLimitMinor',
    'interestCategoryId',
  ] as const) {
    if (changes[key] !== undefined) (set as Record<string, unknown>)[key] = changes[key];
  }
  if (changes.rate === null) set.ratePeriod = null;
  else if (changes.rate !== undefined && changes.ratePeriod === undefined)
    set.ratePeriod = 'monthly';
  const [row] = await tx
    .update(debts)
    .set(set)
    .where(ownedBy(debts.userId, userId, eq(debts.id, id)))
    .returning();
  if (!row) throw new DebtError('debt.not_found');
  return row;
}

/** Balance owed just before a payment dated `on` (payments the same day earlier included). */
export async function outstandingBefore(
  tx: Executor,
  userId: string,
  debt: DebtRow,
  on: LocalDate,
  excluding?: string,
) {
  const [balance] = await balancesAsOf(tx, userId, on, [debt.accountId]);
  let owed = -(balance?.balanceMinor ?? 0n);
  if (excluding) {
    // Editing a payment: what was owed without it.
    const own = (await entriesOf(tx, userId, excluding)).find(
      (e) => e.accountId === debt.accountId,
    );
    if (own) owed += own.amountMinor;
  }
  return owed;
}

export interface PaymentInput {
  fromAccountId: string;
  paidOn: LocalDate;
  amountMinor: bigint;
  interestMinor?: bigint;
  feesMinor?: bigint;
  feeCategoryId?: string;
  description?: string;
}

/** Turns a payment into balanced entries: money out, debt down, interest and fees as expenses. */
async function planPayment(
  tx: Executor,
  userId: string,
  debt: DebtRow,
  input: PaymentInput,
  excluding?: string,
): Promise<PlannedTransaction> {
  const accounts = await accountsById(tx, userId, [input.fromAccountId, debt.accountId]);
  const from = accounts.get(input.fromAccountId);
  const target = accounts.get(debt.accountId);
  if (!from || from.systemRole !== null || from.kind !== 'asset' || from.archived) {
    throw new DebtError('debt.source_account');
  }
  const currency = parseCurrencyCode(debt.currency);
  if (from.currency !== currency) throw new DebtError('debt.currency_mismatch');
  const owed = await outstandingBefore(tx, userId, debt, input.paidOn, excluding);
  const fees = input.feesMinor ?? 0n;
  const interest =
    input.interestMinor ??
    proposeSplit(owed, input.amountMinor - fees, monthlyRate(debt), BigInt(debt.roundingMinor))
      .interestMinor;
  const principal = input.amountMinor - interest - fees;
  if (principal < 0n) throw new DebtError('debt.split_exceeds_payment');
  if (principal > owed) throw new DebtError('debt.overpayment');
  if (interest > 0n && !debt.interestCategoryId)
    throw new DebtError('debt.interest_category_missing');

  const system = (amountMinor: bigint, categoryId: string): PlannedEntry => ({
    account: { systemRole: 'expense', currency },
    accountKind: 'expense',
    currency,
    amountMinor,
    categoryId,
    memo: null,
  });
  const entries: PlannedEntry[] = [
    {
      account: { accountId: input.fromAccountId },
      accountKind: 'asset',
      currency,
      amountMinor: -input.amountMinor,
      categoryId: null,
      memo: null,
    },
  ];
  if (principal > 0n) {
    entries.push({
      account: { accountId: debt.accountId },
      accountKind: 'liability',
      currency,
      amountMinor: principal,
      categoryId: null,
      memo: null,
    });
  }
  if (interest > 0n && debt.interestCategoryId)
    entries.push(system(interest, debt.interestCategoryId));
  if (fees > 0n) {
    // Fees need their own category: the split is read back from the entries by category.
    const category =
      input.feeCategoryId ?? (await expenseCategoryNamed(tx, userId, 'Comisiones bancarias'));
    if (!category || category === debt.interestCategoryId) {
      throw new DebtError('debt.fee_category');
    }
    entries.push(system(fees, category));
  }
  return {
    kind: 'transfer',
    occurredOn: input.paidOn,
    description: input.description ?? `Pago ${target?.name ?? ''}`.trim(),
    payee: null,
    notes: null,
    entries,
  };
}

export async function proposePayment(
  tx: Executor,
  userId: string,
  debtId: string,
  amountMinor: bigint,
  paidOn: LocalDate,
) {
  const debt = await getDebt(tx, userId, debtId);
  const owed = await outstandingBefore(tx, userId, debt, paidOn);
  return {
    outstandingMinor: owed,
    ...proposeSplit(owed, amountMinor, monthlyRate(debt), BigInt(debt.roundingMinor)),
  };
}

export async function recordPayment(
  tx: Executor,
  actor: Actor,
  debtId: string,
  input: PaymentInput,
): Promise<string> {
  const debt = await getDebt(tx, actor.userId, debtId);
  const planned = await planPayment(tx, actor.userId, debt, input);
  const id = await postTransaction(tx, { ...actor, module: 'debts' }, planned, {
    managedBy: 'debts',
  });
  await tx.insert(debtPayments).values({ userId: actor.userId, debtId, transactionId: id });
  return id;
}

async function paymentOf(tx: Executor, userId: string, debtId: string, transactionId: string) {
  const [link] = await tx
    .select()
    .from(debtPayments)
    .where(
      ownedBy(
        debtPayments.userId,
        userId,
        and(eq(debtPayments.debtId, debtId), eq(debtPayments.transactionId, transactionId)),
      ),
    );
  if (!link) throw new DebtError('debt.payment_not_found');
}

export async function editPayment(
  tx: Executor,
  actor: Actor,
  debtId: string,
  transactionId: string,
  version: number,
  input: PaymentInput,
) {
  const debt = await getDebt(tx, actor.userId, debtId);
  await paymentOf(tx, actor.userId, debtId, transactionId);
  const planned = await planPayment(tx, actor.userId, debt, input, transactionId);
  await editTransaction(tx, { ...actor, module: 'debts' }, transactionId, version, planned);
}

export async function voidPayment(
  tx: Executor,
  actor: Actor,
  debtId: string,
  transactionId: string,
  version: number,
) {
  await getDebt(tx, actor.userId, debtId);
  await paymentOf(tx, actor.userId, debtId, transactionId);
  await voidTransaction(tx, { ...actor, module: 'debts' }, transactionId, version);
}

/** Payment history, the split read back from each transaction's entries (data-model §4.6). */
export async function listPayments(
  tx: Executor,
  userId: string,
  debtId: string,
): Promise<PaymentView[]> {
  const debt = await getDebt(tx, userId, debtId);
  const links = await tx
    .select()
    .from(debtPayments)
    .where(ownedBy(debtPayments.userId, userId, eq(debtPayments.debtId, debtId)));
  const views: PaymentView[] = [];
  for (const { transactionId } of links) {
    const found = await getTransaction(tx, userId, transactionId);
    if (!found) continue;
    views.push(paymentView(found.header, found.entries, debt));
  }
  return views.sort((a, b) => b.paidOn.localeCompare(a.paidOn));
}

function paymentView(
  header: {
    id: string;
    version: number;
    status: 'posted' | 'void';
    occurredOn: string;
    description: string;
  },
  rows: EntryRow[],
  debt: DebtRow,
): PaymentView {
  const sum = (filter: (e: EntryRow) => boolean) =>
    rows.filter(filter).reduce((s, e) => s + e.amountMinor, 0n);
  const source = rows.find((e) => e.accountKind === 'asset');
  const interest = sum(
    (e) => e.accountKind === 'expense' && e.categoryId === debt.interestCategoryId,
  );
  const fees = sum((e) => e.accountKind === 'expense' && e.categoryId !== debt.interestCategoryId);
  return {
    transactionId: header.id,
    version: header.version,
    status: header.status,
    paidOn: parseLocalDate(header.occurredOn),
    description: header.description,
    fromAccountId: source?.accountId ?? null,
    amountMinor: (source ? -source.amountMinor : 0n).toString(),
    principalMinor: sum((e) => e.accountId === debt.accountId).toString(),
    interestMinor: interest.toString(),
    feesMinor: fees.toString(),
  };
}
