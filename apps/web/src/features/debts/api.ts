import type {
  DebtInput,
  DebtTermsInput,
  DebtView,
  PaymentInput,
  PaymentView,
  ProposalView,
  ScheduleView,
} from '@finanz/contracts';
import { api } from '../../lib/api';

export const listDebts = () => api<DebtView[]>('GET', '/debts');

export const createDebt = (body: DebtInput, key: string = crypto.randomUUID()) =>
  api<DebtView>('POST', '/debts', body, { 'Idempotency-Key': key });

export const updateDebt = (id: string, body: DebtTermsInput) =>
  api<DebtView>('PATCH', `/debts/${id}`, body);

export const listPayments = (id: string) => api<PaymentView[]>('GET', `/debts/${id}/payments`);

export const getSchedule = (id: string) => api<ScheduleView>('GET', `/debts/${id}/schedule`);

export const getProposal = (id: string, amountMinor: string, paidOn: string) =>
  api<ProposalView>('GET', `/debts/${id}/proposal?amountMinor=${amountMinor}&paidOn=${paidOn}`);

export const recordPayment = (id: string, body: PaymentInput, key: string = crypto.randomUUID()) =>
  api<PaymentView>('POST', `/debts/${id}/payments`, body, { 'Idempotency-Key': key });

export const voidPayment = (id: string, transactionId: string, version: number) =>
  api('POST', `/debts/${id}/payments/${transactionId}/void`, { version });
