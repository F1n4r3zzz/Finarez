import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface PanelProps {
  title: string;
  link?: { to: string; label: string };
  children: ReactNode;
}

export function Panel({ title, link, children }: PanelProps) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {link && (
          <Link to={link.to} className="text-sm font-medium text-brand hover:underline">
            {link.label}
          </Link>
        )}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
