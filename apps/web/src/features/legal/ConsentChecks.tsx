import type { ConsentKind } from '@finanz/contracts';
import { CircleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DOCUMENT_OF: Partial<Record<ConsentKind, string>> = {
  terms: '/legal/terms',
  privacy: '/legal/privacy',
};

/**
 * One unchecked box per consent, each a separate decision: the terms, the authorization to
 * process personal data, and being an adult. The documents open in another tab so nothing typed
 * in the form is lost.
 */
export function ConsentChecks({
  kinds,
  missing = false,
}: {
  kinds: readonly ConsentKind[];
  /** Submitted without checking every box. */
  missing?: boolean;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  const [checked, setChecked] = useState<ReadonlySet<ConsentKind>>(new Set());
  const toggle = (kind: ConsentKind, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(kind);
    else next.delete(kind);
    setChecked(next);
  };
  return (
    <fieldset className="grid gap-1">
      <legend className="sr-only">{t('legal.consents.legend')}</legend>
      {kinds.map((kind) => {
        const path = DOCUMENT_OF[kind];
        // After a submit with boxes left empty, those are the ones to fix.
        const invalid = missing && !checked.has(kind);
        return (
          <label key={kind} className="flex min-h-11 items-start gap-3 py-1.5 text-sm">
            <input
              type="checkbox"
              name={kind}
              required
              checked={checked.has(kind)}
              onChange={(e) => toggle(kind, e.target.checked)}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={invalid ? errorId : undefined}
              className="mt-0.5 size-5 shrink-0 accent-brand"
            />
            <span>
              {t(`legal.consents.${kind}`)}
              {path && (
                <>
                  {' '}
                  <a
                    href={path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    {t(`legal.documents.${kind as 'terms' | 'privacy'}.title`)}
                    <span className="sr-only"> {t('legal.consents.newTab')}</span>
                  </a>
                </>
              )}
            </span>
          </label>
        );
      })}
      {missing && kinds.some((kind) => !checked.has(kind)) && (
        <p id={errorId} className="flex items-start gap-1.5 text-expense text-sm">
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          {t('legal.consents.missing')}
        </p>
      )}
    </fieldset>
  );
}

/** Whether every box in `kinds` was checked in the submitted form. */
export const allChecked = (form: FormData, kinds: readonly ConsentKind[]) =>
  kinds.every((kind) => form.get(kind) === 'on');
