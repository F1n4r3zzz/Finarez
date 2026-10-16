import type {
  ConfirmOccurrence,
  OccurrenceView,
  RuleInput,
  RuleUpdate,
  RuleView,
  RunResult,
} from '@finanz/contracts';
import { api } from '../../lib/api';

/** Records or queues whatever came due since the app was last open. */
export const runRecurring = () => api<RunResult>('POST', '/recurring/run');

export const listRules = () => api<RuleView[]>('GET', '/recurring/rules');

export const getRule = (id: string) => api<RuleView>('GET', `/recurring/rules/${id}`);

export const listPending = () => api<OccurrenceView[]>('GET', '/recurring/pending');

export const ruleHistory = (id: string) =>
  api<OccurrenceView[]>('GET', `/recurring/rules/${id}/occurrences`);

export const createRule = (body: RuleInput, key: string = crypto.randomUUID()) =>
  api<RuleView>('POST', '/recurring/rules', body, { 'Idempotency-Key': key });

export const updateRule = (id: string, body: RuleUpdate) =>
  api<RuleView>('PATCH', `/recurring/rules/${id}`, body);

export const skipNext = (id: string) => api<RuleView>('POST', `/recurring/rules/${id}/skip-next`);

export const endRule = (id: string) => api<RuleView>('POST', `/recurring/rules/${id}/end`);

export const confirmOccurrence = (ruleId: string, dueOn: string, body: ConfirmOccurrence) =>
  api('POST', `/recurring/rules/${ruleId}/occurrences/${dueOn}/confirm`, body);

export const skipOccurrence = (ruleId: string, dueOn: string) =>
  api('POST', `/recurring/rules/${ruleId}/occurrences/${dueOn}/skip`);
