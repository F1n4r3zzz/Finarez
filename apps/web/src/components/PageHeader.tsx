interface PageHeaderProps {
  title: string;
  description: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="mb-6 md:mb-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      <p className="mt-1 max-w-prose text-muted">{description}</p>
    </header>
  );
}
