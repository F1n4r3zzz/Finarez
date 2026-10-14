// Fine interlaced sine curves, like the engraved security pattern on a banknote.
const WIDTH = 640;
const HEIGHT = 200;
const STEP = 4;

function curve(phase: number, amplitude: number): string {
  const points: string[] = [];
  for (let x = 0; x <= WIDTH; x += STEP) {
    const t = (x / WIDTH) * Math.PI * 2;
    const y =
      HEIGHT / 2 +
      amplitude * Math.sin(3 * t + phase) +
      amplitude * 0.35 * Math.sin(7 * t - 2 * phase);
    points.push(`${x},${y.toFixed(1)}`);
  }
  return `M${points.join('L')}`;
}

const PATHS = Array.from({ length: 18 }, (_, i) => curve((i * Math.PI) / 9, 46 + (i % 3) * 12));

export function Guilloche({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1}>
        {PATHS.map((d) => (
          <path key={d} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
