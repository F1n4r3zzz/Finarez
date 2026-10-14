import { Link } from 'react-router';

export function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-md">
      <svg viewBox="0 0 64 64" aria-hidden="true" className="size-8">
        <rect width="64" height="64" rx="14" className="fill-logo" />
        <path d="M22 16h22v7H30v7h12v7H30v11h-8z" fill="#ffffff" />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-ink">Finanz</span>
    </Link>
  );
}
