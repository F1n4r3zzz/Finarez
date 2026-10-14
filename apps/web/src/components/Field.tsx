import { ChevronDown, CircleAlert, Eye, EyeOff } from 'lucide-react';
import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useId,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

interface FieldFrame {
  label: string;
  /** Shown under the field and read by screen readers with it. */
  hint?: string;
  error?: string;
  /** Next to the label, e.g. a "forgot password" link. */
  labelAside?: ReactNode;
}

const CONTROL =
  'h-11 w-full rounded-lg border bg-surface px-3 text-base text-ink transition-colors duration-150 hover:border-subtle';

function controlBorder(error?: string) {
  return error ? 'border-expense' : 'border-line';
}

/** Label, control, error and hint, with the ids that tie them together. */
function useFieldIds(id: string | undefined, hint?: string, error?: string) {
  const fallback = useId();
  const controlId = id ?? fallback;
  const hintId = hint && !error ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  return {
    controlId,
    hintId,
    errorId,
    describedBy: [errorId, hintId].filter(Boolean).join(' ') || undefined,
  };
}

function Frame({
  controlId,
  hintId,
  errorId,
  label,
  hint,
  error,
  labelAside,
  children,
}: FieldFrame & {
  controlId: string;
  hintId?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={controlId} className="font-medium text-sm">
          {label}
        </label>
        {labelAside && <span className="text-sm">{labelAside}</span>}
      </div>
      {children}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-expense text-sm">
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {/* The error says what to fix; the hint would only repeat it. */}
      {hint && !error && (
        <p id={hintId} className="text-sm text-subtle">
          {hint}
        </p>
      )}
    </div>
  );
}

type InputProps = FieldFrame & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

export function TextField({ label, hint, error, labelAside, id, ...input }: InputProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Frame {...ids} label={label} hint={hint} error={error} labelAside={labelAside}>
      <input
        id={ids.controlId}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={`${CONTROL} ${controlBorder(error)}`}
        {...input}
      />
    </Frame>
  );
}

/** A password input with a button to show what was typed. */
export function PasswordField({
  label,
  hint,
  error,
  labelAside,
  id,
  ...input
}: Omit<InputProps, 'type'>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const ids = useFieldIds(id, hint, error);
  const toggleLabel = t(visible ? 'auth.hidePassword' : 'auth.showPassword');
  const Icon = visible ? EyeOff : Eye;
  return (
    <Frame {...ids} label={label} hint={hint} error={error} labelAside={labelAside}>
      <div className="relative">
        <input
          id={ids.controlId}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          className={`${CONTROL} ${controlBorder(error)} pr-12`}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={toggleLabel}
          aria-controls={ids.controlId}
          title={toggleLabel}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-muted transition-colors duration-150 hover:text-ink"
        >
          <Icon size={18} aria-hidden="true" />
        </button>
      </div>
    </Frame>
  );
}

type SelectProps = FieldFrame &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & { children: ReactNode };

export function SelectField({
  label,
  hint,
  error,
  labelAside,
  id,
  children,
  ...select
}: SelectProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Frame {...ids} label={label} hint={hint} error={error} labelAside={labelAside}>
      <div className="relative">
        <select
          id={ids.controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          className={`${CONTROL} ${controlBorder(error)} appearance-none truncate pr-10`}
          {...select}
        >
          {children}
        </select>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
        />
      </div>
    </Frame>
  );
}
