import { api } from '../../lib/api';

export interface SessionUser {
  id: string;
  email: string;
}

/** Where the confirmation link lands: sign-in, with a notice (or `error=` if it failed). */
const VERIFIED_CALLBACK = '/sign-in?verified=1';
/** Where the reset link lands, with `token=` (or `error=` if it expired). */
const RESET_CALLBACK = '/reset-password';

export async function getSession(): Promise<SessionUser | null> {
  const session = await api<{ user: SessionUser } | null>('GET', '/auth/get-session');
  return session?.user ?? null;
}

export async function signIn(email: string, password: string): Promise<void> {
  await api('POST', '/auth/sign-in/email', { email, password });
}

export async function signUp(email: string, password: string): Promise<void> {
  // Finarez doesn't ask for a name; the auth library requires the field.
  await api('POST', '/auth/sign-up/email', {
    name: '',
    email,
    password,
    callbackURL: VERIFIED_CALLBACK,
  });
}

export async function signOut(): Promise<void> {
  await api('POST', '/auth/sign-out', {});
}

export async function resendVerification(email: string): Promise<void> {
  await api('POST', '/auth/send-verification-email', { email, callbackURL: VERIFIED_CALLBACK });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api('POST', '/auth/request-password-reset', { email, redirectTo: RESET_CALLBACK });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api('POST', '/auth/reset-password', { token, newPassword });
}
