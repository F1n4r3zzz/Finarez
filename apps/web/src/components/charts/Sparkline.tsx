const WIDTH = 72;
const HEIGHT = 24;
const PAD = 2;

/**
 * A small trend line in the current text color, scaled between its own lowest and highest
 * values (no axis: the figure next to it carries the number). With `partialLast`, the last
 * step is dashed: that period isn't over yet. `stretch` fills the given box instead of 72×24.
 */
export function Sparkline({
  values,
  partialLast = false,
  stretch = false,
  className = '',
}: {
  values: readonly bigint[];
  partialLast?: boolean;
  stretch?: boolean;
  className?: string;
}) {
  if (values.length < 2) return null;
  let low = values[0] as bigint;
  let high = low;
  for (const v of values) {
    if (v < low) low = v;
    if (v > high) high = v;
  }
  const span = high - low;
  const points = values.map((v, i) => {
    const x = PAD + (i * (WIDTH - 2 * PAD)) / (values.length - 1);
    // Flat when nothing changed; otherwise the share of the range, exact enough for drawing.
    const share = span === 0n ? 0.5 : Number(((v - low) * 10_000n) / span) / 10_000;
    const y = HEIGHT - PAD - share * (HEIGHT - 2 * PAD);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const solid = partialLast ? points.slice(0, -1) : points;
  const dashed = partialLast ? points.slice(-2) : [];
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio={stretch ? 'none' : undefined}
      aria-hidden="true"
      className={`${stretch ? '' : 'h-6 w-[72px]'} shrink-0 overflow-visible ${className}`}
    >
      {solid.length > 1 && (
        <polyline
          points={solid.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {dashed.length === 2 && (
        <polyline
          points={dashed.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
