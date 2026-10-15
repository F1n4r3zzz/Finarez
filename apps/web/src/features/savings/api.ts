import type {
  AllocationInput,
  AllocationView,
  GoalInput,
  GoalUpdate,
  GoalView,
  SavingsAccountView,
} from '@finanz/contracts';
import { api } from '../../lib/api';

export const listGoals = () => api<GoalView[]>('GET', '/savings/goals');

export const createGoal = (body: GoalInput, key: string = crypto.randomUUID()) =>
  api<GoalView>('POST', '/savings/goals', body, { 'Idempotency-Key': key });

export const updateGoal = (id: string, body: GoalUpdate) =>
  api<GoalView>('PATCH', `/savings/goals/${id}`, body);

export const archiveGoal = (id: string) => api<GoalView>('POST', `/savings/goals/${id}/archive`);

export const listAllocations = (id: string) =>
  api<AllocationView[]>('GET', `/savings/goals/${id}/allocations`);

export const allocate = (id: string, body: AllocationInput, key: string = crypto.randomUUID()) =>
  api<AllocationView>('POST', `/savings/goals/${id}/allocations`, body, { 'Idempotency-Key': key });

export const voidAllocation = (id: string, allocationId: string) =>
  api('POST', `/savings/goals/${id}/allocations/${allocationId}/void`);

export const listSavingsAccounts = () => api<SavingsAccountView[]>('GET', '/savings/accounts');
