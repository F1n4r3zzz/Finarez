import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@finanz/contracts';
import type { es } from '../../i18n/es';

export type FieldErrorKey = keyof typeof es.auth.fields;
export type FieldErrors = Partial<Record<'email' | 'password', FieldErrorKey>>;

export const PASSWORD_LIMITS = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

export function checkEmail(email: string): FieldErrorKey | undefined {
  if (!email) return 'emailRequired';
  if (!EMAIL.test(email)) return 'emailInvalid';
  return undefined;
}

/** Signing in only needs a password; length rules apply when choosing one. */
export function checkPassword(password: string): FieldErrorKey | undefined {
  return password ? undefined : 'passwordRequired';
}

export function checkNewPassword(password: string): FieldErrorKey | undefined {
  if (!password) return 'passwordRequired';
  if (password.length < PASSWORD_MIN_LENGTH) return 'passwordTooShort';
  if (password.length > PASSWORD_MAX_LENGTH) return 'passwordTooLong';
  return undefined;
}

/** Drops fields without an error; `undefined` when the form is valid. */
export function fieldErrors(errors: FieldErrors): FieldErrors | undefined {
  const found = Object.entries(errors).filter(([, key]) => key !== undefined);
  return found.length > 0 ? Object.fromEntries(found) : undefined;
}
