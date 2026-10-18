import { type ReactNode, useId } from 'react';
import { Link } from 'react-router';

interface PanelProps {
  title: string;
  /** A line under the title, e.g. what the figures cover. */
  subtitle?: string;
  link?: { to: string; label: string };
  /** A control in the header's corner instead of a link, e.g. a period filter. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, link, action, children, className = '' }: PanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-[22px] border border-line bg-surface ${className}`}
    >
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 pt-5 sm:px-6">
        {/* The corner control drops below the title when the panel is too narrow for both. */}
        <div className="min-w-0 flex-1 basis-44">
          <h2 id={headingId} className="font-semibold text-lg">
            {title}
          </h2>
          {subtitle && <p className="text-sm text-subtle">{subtitle}</p>}
        </div>
        {action}
        {link && (
          <Link
            to={link.to}
            className="-mr-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-brand transition-colors duration-150 hover:bg-brand-soft"
          >
            {link.label}
          </Link>
        )}
      </header>
      <div className="px-5 pt-2 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}
