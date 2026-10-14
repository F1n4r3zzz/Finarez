import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="rounded-sm font-medium text-brand underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
