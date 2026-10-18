import { Plus } from 'lucide-react';
import { Link } from 'react-router';

const VARIANTS = {
  primary: 'bg-action text-on-action hover:bg-action/90',
  /** On the brand band at the top of the page. */
  band: 'bg-band-chip text-on-band hover:bg-band-chip/80',
} as const;

/** The primary "add" link of a page: full width on phones, compact from tablets up. */
export function ActionLink({
  to,
  label,
  variant = 'primary',
}: {
  to: string;
  label: string;
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 font-semibold transition-colors duration-150 sm:w-auto ${VARIANTS[variant]}`}
    >
      <Plus size={18} aria-hidden="true" />
      {label}
    </Link>
  );
}
