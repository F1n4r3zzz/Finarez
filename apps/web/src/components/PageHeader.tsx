import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  /** The page's main action (e.g. "Agregar cuenta"): beside the title, full width on phones. */
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 md:mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <p className="mt-1 max-w-prose text-muted">{description}</p>
      </div>
      {action && <div className="w-full sm:w-auto">{action}</div>}
    </header>
  );
}
