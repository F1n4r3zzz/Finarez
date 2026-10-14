import { type ReactNode, useId } from 'react';
import { Link } from 'react-router';

interface PanelProps {
  title: string;
  link?: { to: string; label: string };
  children: ReactNode;
  className?: string;
}

export function Panel({ title, link, children, className = '' }: PanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-xl border border-line bg-surface ${className}`}
    >
      <header className="flex min-h-14 items-center justify-between gap-4 px-5 pt-4">
        <h2 id={headingId} className="font-semibold">
          {title}
        </h2>
        {link && (
          <Link
            to={link.to}
            className="-mr-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-brand transition-colors duration-150 hover:bg-brand-soft"
          >
            {link.label}
          </Link>
        )}
      </header>
      <div className="px-5 pt-2 pb-5">{children}</div>
    </section>
  );
}
