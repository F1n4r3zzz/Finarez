import { Link } from 'react-router';

export function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-md">
      <svg viewBox="0 0 64 64" aria-hidden="true" className="size-8">
        <path d="M7 10h26V4l17 15-17 15v-6H7z" className="fill-logo" />
        <path d="M57 54H31v6L14 45l17-15v6h26z" className="fill-logo-accent" />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-ink">Finarez</span>
    </Link>
  );
}
