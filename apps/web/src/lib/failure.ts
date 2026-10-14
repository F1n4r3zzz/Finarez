import { isApiFailure } from './api';

/** Why a request failed, as a key under `failures`, plus the wait in minutes for rate limits. */
export interface Failure {
  key: 'invalidCredentials' | 'tooManyAttempts' | 'emailUnavailable' | 'network' | 'unexpected';
  minutes?: number;
}

export function describeFailure(error: unknown): Failure {
  if (!isApiFailure(error)) return { key: 'unexpected' };
  if (error.status === 0) return { key: 'network' };
  if (error.status === 429) {
    // Auth limits use windows of up to an hour; without a hint, suggest five minutes.
    return { key: 'tooManyAttempts', minutes: Math.ceil((error.retryAfter ?? 300) / 60) };
  }
  if (error.code === 'INVALID_EMAIL_OR_PASSWORD') return { key: 'invalidCredentials' };
  if (error.code === 'EMAIL_UNAVAILABLE') return { key: 'emailUnavailable' };
  return { key: 'unexpected' };
}
