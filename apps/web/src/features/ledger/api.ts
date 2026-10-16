import type {
  AccountView,
  BalanceSeriesReport,
  Category,
  DraftInput,
  MonthlyReport,
  NetWorthReport,
  SummaryReport,
  TransactionView,
} from '@finanz/contracts';
import { api } from '../../lib/api';

export const listAccounts = () => api<AccountView[]>('GET', '/ledger/accounts');

export const getMonthly = (from: string, to: string) =>
  api<MonthlyReport>('GET', `/reports/monthly?from=${from}&to=${to}`);

/** The accounts' total at the end of each day from `from` to `to`, in the primary currency. */
export const getBalances = (from: string, to: string, accountIds: readonly string[]) =>
  api<BalanceSeriesReport>(
    'GET',
    `/reports/balances?from=${from}&to=${to}&accounts=${accountIds.join(',')}`,
  );

/** Creating an account can post its opening balance, so it is keyed like a transaction. */
export const createAccount = (body: unknown, key: string = crypto.randomUUID()) =>
  api<AccountView>('POST', '/ledger/accounts', body, { 'Idempotency-Key': key });

export const updateAccount = (id: string, body: unknown) =>
  api<AccountView>('PATCH', `/ledger/accounts/${id}`, body);

export const listCategories = () => api<Category[]>('GET', '/categories');

export function listTransactions(params: {
  accountId?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) query.set(k, String(v));
  const suffix = query.size ? `?${query}` : '';
  return api<TransactionView[]>('GET', `/ledger/transactions${suffix}`);
}

export const getTransaction = (id: string) =>
  api<TransactionView>('GET', `/ledger/transactions/${id}`);

/** Each new transaction gets its own key, so a retried request can never post twice. */
export const createTransaction = (draft: DraftInput, key: string = crypto.randomUUID()) =>
  api<TransactionView>('POST', '/ledger/transactions', draft, { 'Idempotency-Key': key });

export const editTransaction = (
  id: string,
  body: { version: number; draft: DraftInput; confirmReconciledChange?: boolean },
) => api<TransactionView>('PUT', `/ledger/transactions/${id}`, body);

export const voidTransaction = (id: string, version: number) =>
  api<TransactionView>('POST', `/ledger/transactions/${id}/void`, { version });

export const restoreTransaction = (id: string, version: number) =>
  api<TransactionView>('POST', `/ledger/transactions/${id}/restore`, { version });

export const getSummary = (from: string, to: string) =>
  api<SummaryReport>('GET', `/reports/summary?from=${from}&to=${to}`);

export const getNetWorth = (on?: string) =>
  api<NetWorthReport>('GET', `/reports/net-worth${on ? `?on=${on}` : ''}`);
