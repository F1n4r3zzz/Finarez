import { isApiFailure } from './api';

/** Why a request failed, as a key under `failures`, plus the wait in minutes for rate limits. */
export interface Failure {
  key:
    | 'invalidCredentials'
    | 'tooManyAttempts'
    | 'emailUnavailable'
    | 'network'
    | 'unexpected'
    | 'staleVersion'
    | 'reconciledChange'
    | 'managedTransaction'
    | 'accountArchived'
    | 'amountsDiffer'
    | 'sameAccount'
    | 'amountZero'
    | 'overpayment'
    | 'debtSource'
    | 'currencyMismatch'
    | 'splitExceedsPayment'
    | 'interestCategoryMissing'
    | 'feeCategoryMissing'
    | 'goalNameTaken'
    | 'withdrawExceeds'
    | 'voidBreaksBalance'
    | 'goalNotEmpty'
    | 'goalArchived'
    | 'savingsAccount'
    | 'transferCurrency'
    | 'budgetCategory'
    | 'budgetDuplicate'
    | 'budgetArchived';
  minutes?: number;
}

/** API error codes the user can act on, and the message that says how. */
const BY_CODE: Record<string, Failure['key']> = {
  INVALID_EMAIL_OR_PASSWORD: 'invalidCredentials',
  EMAIL_UNAVAILABLE: 'emailUnavailable',
  'ledger.stale_version': 'staleVersion',
  'ledger.reconciled_change': 'reconciledChange',
  'ledger.managed_transaction': 'managedTransaction',
  'ledger.account_archived': 'accountArchived',
  'ledger.amounts_differ': 'amountsDiffer',
  'ledger.same_account': 'sameAccount',
  'ledger.amount_zero': 'amountZero',
  'debt.overpayment': 'overpayment',
  'debt.source_account': 'debtSource',
  'debt.currency_mismatch': 'currencyMismatch',
  'debt.split_exceeds_payment': 'splitExceedsPayment',
  'debt.interest_category_missing': 'interestCategoryMissing',
  'debt.fee_category': 'feeCategoryMissing',
  'savings.duplicate_name': 'goalNameTaken',
  'savings.withdraw_exceeds': 'withdrawExceeds',
  'savings.void_breaks_balance': 'voidBreaksBalance',
  'savings.goal_not_empty': 'goalNotEmpty',
  'savings.goal_archived': 'goalArchived',
  'savings.account': 'savingsAccount',
  'savings.same_account': 'sameAccount',
  'savings.transfer_currency': 'transferCurrency',
  'budgets.category': 'budgetCategory',
  'budgets.duplicate_category': 'budgetDuplicate',
  'budgets.archived': 'budgetArchived',
};

export function describeFailure(error: unknown): Failure {
  if (!isApiFailure(error)) return { key: 'unexpected' };
  if (error.status === 0) return { key: 'network' };
  if (error.status === 429) {
    // Auth limits use windows of up to an hour; without a hint, suggest five minutes.
    return { key: 'tooManyAttempts', minutes: Math.ceil((error.retryAfter ?? 300) / 60) };
  }
  const key = error.code ? BY_CODE[error.code] : undefined;
  return { key: key ?? 'unexpected' };
}
