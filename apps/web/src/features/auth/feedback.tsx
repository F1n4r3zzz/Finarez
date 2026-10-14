import { type RefObject, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { type FieldErrorKey, PASSWORD_LIMITS } from './form';

/** The translated message for a field error key, or nothing. */
export function useFieldError() {
  const { t } = useTranslation();
  return (key: FieldErrorKey | undefined) =>
    key === undefined ? undefined : t(`auth.fields.${key}`, PASSWORD_LIMITS);
}

/** After a failed submit, moves focus to the first field that needs fixing. */
export function useFocusFirstInvalid(form: RefObject<HTMLFormElement | null>, result: unknown) {
  useEffect(() => {
    if (result) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [form, result]);
}
