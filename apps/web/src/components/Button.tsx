import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

const VARIANTS = {
  primary: 'bg-brand text-on-brand hover:bg-brand/90',
  secondary: 'border border-line bg-surface text-ink hover:bg-hover',
} as const;

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: keyof typeof VARIANTS;
  /** Shows a spinner and blocks repeat clicks while the request runs. */
  pending?: boolean;
  wide?: boolean;
}

export function Button({
  variant = 'primary',
  pending = false,
  wide = false,
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-medium transition-colors duration-150 disabled:cursor-wait disabled:opacity-70 ${VARIANTS[variant]} ${wide ? 'w-full' : ''}`}
      {...rest}
    >
      {pending && (
        <LoaderCircle size={18} aria-hidden="true" className="motion-safe:animate-spin" />
      )}
      {children}
    </button>
  );
}
