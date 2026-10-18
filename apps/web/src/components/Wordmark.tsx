import { Link } from 'react-router';

const TONES = {
  /** On the brand band. */
  band: { arrow: 'fill-logo', accent: 'fill-logo-accent', text: 'text-on-band' },
  plain: { arrow: 'fill-brand', accent: 'fill-cta', text: 'text-ink' },
} as const;

/** The logo and name. */
export function Wordmark({ tone = 'band' }: { tone?: keyof typeof TONES }) {
  const colors = TONES[tone];
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-md">
      <svg viewBox="0 0 64 64" aria-hidden="true" className="size-8">
        <path d="M7 10h26V4l17 15-17 15v-6H7z" className={colors.arrow} />
        <path d="M57 54H31v6L14 45l17-15v6h26z" className={colors.accent} />
      </svg>
      <span className={`font-bold text-[1.1875rem] tracking-tight ${colors.text}`}>Finarez</span>
    </Link>
  );
}
