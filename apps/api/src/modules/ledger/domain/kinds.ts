/** Account kinds of the internal ledger (data-model §4.1). Users only see asset and liability. */
export const ACCOUNT_KINDS = [
  'asset',
  'liability',
  'income',
  'expense',
  'equity',
  'clearing',
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export type { AccountSubtype } from '@finanz/contracts';
export { ASSET_SUBTYPES, LIABILITY_SUBTYPES } from '@finanz/contracts';

/** Hidden accounts that take the other side of entries, one per role and currency. */
export const SYSTEM_ROLES = ['income', 'expense', 'opening_balance', 'valuation', 'fx'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const SYSTEM_ROLE_KIND: Readonly<Record<SystemRole, AccountKind>> = {
  income: 'income',
  expense: 'expense',
  opening_balance: 'equity',
  valuation: 'equity',
  fx: 'clearing',
};

/** UI label only: no report may read it (CP1 #3). */
export const TRANSACTION_KINDS = [
  'income',
  'expense',
  'transfer',
  'adjustment',
  'opening',
  'valuation',
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_STATUSES = ['posted', 'void'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Modules whose transactions can only change through their own use cases (data-model §4.6). */
export const MANAGING_MODULES = ['debts', 'savings', 'investments', 'imports'] as const;
export type ManagingModule = (typeof MANAGING_MODULES)[number];

export const AUDIT_ACTIONS = ['create', 'update', 'void', 'restore'] as const;
export const AUDIT_SOURCES = [
  'ui',
  'import',
  'recurring',
  'debts',
  'savings',
  'investments',
  'system',
] as const;
