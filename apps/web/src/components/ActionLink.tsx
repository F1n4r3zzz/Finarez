import { Plus } from 'lucide-react';
import { Link } from 'react-router';

/** The primary "add" link of a page: full width on phones, compact from tablets up. */
export function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 font-medium text-on-brand transition-colors duration-150 hover:bg-brand/90 sm:w-auto"
    >
      <Plus size={18} aria-hidden="true" />
      {label}
    </Link>
  );
}
