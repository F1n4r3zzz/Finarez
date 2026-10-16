import type { BudgetInput, BudgetPeriodView, BudgetUpdate, BudgetView } from '@finanz/contracts';
import { api } from '../../lib/api';

const on = (date?: string) => (date ? `?on=${date}` : '');

/** Active budgets with the period containing `date` (today when omitted). */
export const listBudgets = (date?: string) => api<BudgetView[]>('GET', `/budgets${on(date)}`);

export const getBudget = (id: string, date?: string) =>
  api<BudgetView>('GET', `/budgets/${id}${on(date)}`);

export const budgetHistory = (id: string, count = 12) =>
  api<BudgetPeriodView[]>('GET', `/budgets/${id}/history?count=${count}`);

export const createBudget = (body: BudgetInput, key: string = crypto.randomUUID()) =>
  api<BudgetView>('POST', '/budgets', body, { 'Idempotency-Key': key });

export const updateBudget = (id: string, body: BudgetUpdate) =>
  api<BudgetView>('PATCH', `/budgets/${id}`, body);

export const archiveBudget = (id: string) => api<BudgetView>('POST', `/budgets/${id}/archive`);
