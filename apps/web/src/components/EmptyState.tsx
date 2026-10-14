import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, body, children }: EmptyStateProps) {
  return (
    <section className="rounded-xl border border-line bg-surface px-6 py-12 text-center md:py-16">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon size={24} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-muted">{body}</p>
      {children}
    </section>
  );
}
