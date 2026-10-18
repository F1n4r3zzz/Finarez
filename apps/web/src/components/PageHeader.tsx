import type { ReactNode } from 'react';
import { InBand } from '../app/band';

interface PageHeaderProps {
  title: string;
  description: string;
  /** The page's main action (e.g. "Agregar cuenta"), in band style: beside the title, full width on phones. */
  action?: ReactNode;
}

/** The page's title, summary and actions, shown on the brand band at the top of the page. */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <InBand>
      <header className="flex flex-wrap items-end justify-between gap-4 pt-5 lg:pt-7">
        <div className="min-w-0">
          <h1 className="font-semibold text-3xl text-on-band leading-tight tracking-tight lg:text-[2.5rem]">
            {title}
          </h1>
          <p className="mt-1.5 max-w-prose text-band-muted">{description}</p>
        </div>
        {action && <div className="w-full sm:w-auto">{action}</div>}
      </header>
    </InBand>
  );
}
