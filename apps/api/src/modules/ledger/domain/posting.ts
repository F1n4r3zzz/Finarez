import { type CurrencyCode, type LocalDate, MAX_MINOR, MIN_MINOR } from '@finanz/kernel';
import type { AccountKind, SystemRole, TransactionKind } from './kinds';

/** An expected refusal; `code` is stable and translated by the UI. */
export class LedgerError extends Error {
  constructor(
    readonly code:
      | 'ledger.account_not_found'
      | 'ledger.account_archived'
      | 'ledger.category_not_found'
      | 'ledger.category_kind'
      | 'ledger.same_account'
      | 'ledger.amount_zero'
      | 'ledger.amount_out_of_range'
      | 'ledger.amounts_differ'
      | 'ledger.stale_version'
      | 'ledger.reconciled_change'
      | 'ledger.managed_transaction'
      | 'ledger.not_found'
      | 'ledger.already_void'
      | 'ledger.not_void',
    message: string = code,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

/** A category line: what was spent or earned in one category. Negative = refund or reversal. */
export interface CategoryLine {
  categoryId: string;
  amountMinor: bigint;
  memo?: string | null;
}

interface DraftBase {
  occurredOn: LocalDate;
  description: string;
  payee?: string | null;
  notes?: string | null;
}

/**
 * What the user wants to record, before it becomes entries. Amounts are minor units in the
 * named account's currency.
 */
export type Draft =
  | (DraftBase & { kind: 'expense'; accountId: string; lines: CategoryLine[] })
  | (DraftBase & { kind: 'income'; accountId: string; lines: CategoryLine[] })
  | (DraftBase & {
      kind: 'transfer';
      from: { accountId: string; amountMinor: bigint };
      to: { accountId: string; amountMinor: bigint };
      /** Charged in the source currency, in the same bank movement (one leg). */
      fee?: { amountMinor: bigint; categoryId: string } | null;
    })
  | (DraftBase & {
      kind: 'adjustment';
      accountId: string;
      /** Signed change to the balance; the category's kind must match (income +, expense −). */
      amountMinor: bigint;
      categoryId: string;
    });

export interface PostingAccount {
  kind: AccountKind;
  currency: CurrencyCode;
  archived: boolean;
  systemRole: SystemRole | null;
}

/** Accounts and categories the draft names, already loaded for this user. */
export interface PostingContext {
  accounts: ReadonlyMap<string, PostingAccount>;
  categories: ReadonlyMap<string, 'income' | 'expense'>;
}

/** Either a user account by id or a hidden system account by role and currency. */
export type AccountRef = { accountId: string } | { systemRole: SystemRole; currency: CurrencyCode };

export interface PlannedEntry {
  account: AccountRef;
  currency: CurrencyCode;
  accountKind: AccountKind;
  amountMinor: bigint;
  categoryId: string | null;
  memo: string | null;
}

export interface PlannedTransaction {
  kind: TransactionKind;
  occurredOn: LocalDate;
  description: string;
  payee: string | null;
  notes: string | null;
  entries: PlannedEntry[];
}

function checkAmount(amount: bigint): bigint {
  if (amount === 0n) throw new LedgerError('ledger.amount_zero');
  if (amount > MAX_MINOR || amount < MIN_MINOR) throw new LedgerError('ledger.amount_out_of_range');
  return amount;
}

function userAccount(ctx: PostingContext, accountId: string) {
  const account = ctx.accounts.get(accountId);
  if (!account || account.systemRole !== null || !['asset', 'liability'].includes(account.kind)) {
    throw new LedgerError('ledger.account_not_found');
  }
  if (account.archived) throw new LedgerError('ledger.account_archived');
  return account;
}

function categoryOf(ctx: PostingContext, categoryId: string, kind: 'income' | 'expense') {
  const found = ctx.categories.get(categoryId);
  if (!found) throw new LedgerError('ledger.category_not_found');
  if (found !== kind) throw new LedgerError('ledger.category_kind');
  return categoryId;
}

const leg = (
  accountId: string,
  account: { kind: AccountKind; currency: CurrencyCode },
  amountMinor: bigint,
): PlannedEntry => ({
  account: { accountId },
  currency: account.currency,
  accountKind: account.kind,
  amountMinor: checkAmount(amountMinor),
  categoryId: null,
  memo: null,
});

const system = (
  role: SystemRole,
  kind: AccountKind,
  currency: CurrencyCode,
  amountMinor: bigint,
  categoryId: string | null = null,
  memo: string | null = null,
): PlannedEntry => ({
  account: { systemRole: role, currency },
  currency,
  accountKind: kind,
  amountMinor: checkAmount(amountMinor),
  categoryId,
  memo,
});

/**
 * Turns a draft into balanced entries (data-model §5). The hidden side of every movement is a
 * system account in the same currency, so each currency balances on its own.
 */
export function planTransaction(draft: Draft, ctx: PostingContext): PlannedTransaction {
  const header = {
    kind: draft.kind,
    occurredOn: draft.occurredOn,
    description: draft.description,
    payee: draft.payee ?? null,
    notes: draft.notes ?? null,
  };

  switch (draft.kind) {
    case 'expense':
    case 'income': {
      const account = userAccount(ctx, draft.accountId);
      if (draft.lines.length === 0) throw new LedgerError('ledger.amount_zero');
      const sign = draft.kind === 'expense' ? 1n : -1n;
      const lines = draft.lines.map((l) =>
        system(
          draft.kind,
          draft.kind,
          account.currency,
          sign * checkAmount(l.amountMinor),
          categoryOf(ctx, l.categoryId, draft.kind),
          l.memo ?? null,
        ),
      );
      const total = lines.reduce((sum, l) => sum + l.amountMinor, 0n);
      return { ...header, entries: [leg(draft.accountId, account, -total), ...lines] };
    }

    case 'transfer': {
      if (draft.from.accountId === draft.to.accountId) throw new LedgerError('ledger.same_account');
      const from = userAccount(ctx, draft.from.accountId);
      const to = userAccount(ctx, draft.to.accountId);
      const sent = checkAmount(draft.from.amountMinor);
      const received = checkAmount(draft.to.amountMinor);
      if (sent < 0n || received < 0n) throw new LedgerError('ledger.amount_out_of_range');
      const fee = draft.fee ? checkAmount(draft.fee.amountMinor) : 0n;
      const feeLine = draft.fee
        ? [
            system(
              'expense',
              'expense',
              from.currency,
              fee,
              categoryOf(ctx, draft.fee.categoryId, 'expense'),
            ),
          ]
        : [];
      const outgoing = leg(draft.from.accountId, from, -(sent + fee));
      const incoming = leg(draft.to.accountId, to, received);
      if (from.currency === to.currency) {
        if (sent !== received) throw new LedgerError('ledger.amounts_differ');
        return { ...header, entries: [outgoing, incoming, ...feeLine] };
      }
      return {
        ...header,
        entries: [
          outgoing,
          system('fx', 'clearing', from.currency, sent),
          system('fx', 'clearing', to.currency, -received),
          incoming,
          ...feeLine,
        ],
      };
    }

    case 'adjustment': {
      const account = userAccount(ctx, draft.accountId);
      const change = checkAmount(draft.amountMinor);
      const kind = change > 0n ? 'income' : 'expense';
      return {
        ...header,
        entries: [
          leg(draft.accountId, account, change),
          system(kind, kind, account.currency, -change, categoryOf(ctx, draft.categoryId, kind)),
        ],
      };
    }
  }
}

/** The opening balance of a new account against the hidden equity account. */
export function planOpening(
  accountId: string,
  account: { kind: AccountKind; currency: CurrencyCode },
  amountMinor: bigint,
  occurredOn: LocalDate,
): PlannedTransaction {
  return {
    kind: 'opening',
    occurredOn,
    description: 'Saldo inicial',
    payee: null,
    notes: null,
    entries: [
      leg(accountId, account, amountMinor),
      system('opening_balance', 'equity', account.currency, -amountMinor),
    ],
  };
}
