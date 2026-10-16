import type { ReactNode } from 'react';

export interface DonutSlice {
  key: string;
  value: bigint;
  /** Fill utility for the slice, e.g. `fill-slice-1`. */
  fill: string;
}

const OUTER = 96;
const INNER = 66;

/** A point on the ring, `turn` of the way round clockwise from the top. */
function at(turn: number, radius: number): string {
  const angle = turn * 2 * Math.PI - Math.PI / 2;
  return `${(radius * Math.cos(angle)).toFixed(3)} ${(radius * Math.sin(angle)).toFixed(3)}`;
}

function arc(start: number, end: number): string {
  const large = end - start > 0.5 ? 1 : 0;
  return [
    `M ${at(start, OUTER)}`,
    `A ${OUTER} ${OUTER} 0 ${large} 1 ${at(end, OUTER)}`,
    `L ${at(end, INNER)}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${at(start, INNER)}`,
    'Z',
  ].join(' ');
}

/**
 * A ring of slices clockwise from the top, each as large as its share, with a 2px surface gap
 * between them; `children` sits in the middle. Values and names belong in a legend beside it:
 * the ring is a picture of the shares, hidden from screen readers.
 */
export function DonutChart({
  slices,
  active,
  onActive,
  children,
}: {
  slices: readonly DonutSlice[];
  /** The slice to bring forward (the others fade). */
  active?: string;
  onActive?: (key: string | undefined) => void;
  children?: ReactNode;
}) {
  const total = slices.reduce((sum, s) => sum + (s.value > 0n ? s.value : 0n), 0n);
  let turn = 0;
  const shapes = slices
    .filter((s) => s.value > 0n)
    .map((s) => {
      // Shares in millionths: exact enough for drawing, and bigint stays exact up to there.
      const share = total > 0n ? Number((s.value * 1_000_000n) / total) / 1_000_000 : 0;
      const start = turn;
      turn += share;
      return { ...s, start, end: Math.min(turn, 1), whole: share >= 0.999_999 };
    });

  return (
    <div className="relative mx-auto aspect-square w-full max-w-56">
      <svg viewBox="-100 -100 200 200" aria-hidden="true" className="size-full">
        {shapes.length === 0 ? (
          <circle
            r={(OUTER + INNER) / 2}
            className="fill-none stroke-bar-track"
            strokeWidth={OUTER - INNER}
          />
        ) : (
          shapes.map((s) => {
            const faded = active !== undefined && active !== s.key;
            const common = {
              className: `${s.fill} stroke-surface transition-opacity duration-150 ${faded ? 'opacity-35' : ''}`,
              strokeWidth: 2,
              onMouseEnter: () => onActive?.(s.key),
              onMouseLeave: () => onActive?.(undefined),
            };
            return s.whole ? (
              <path
                key={s.key}
                {...common}
                fillRule="evenodd"
                d={`M 0 ${-OUTER} A ${OUTER} ${OUTER} 0 1 1 0 ${OUTER} A ${OUTER} ${OUTER} 0 1 1 0 ${-OUTER} Z M 0 ${-INNER} A ${INNER} ${INNER} 0 1 0 0 ${INNER} A ${INNER} ${INNER} 0 1 0 0 ${-INNER} Z`}
              />
            ) : (
              <path key={s.key} {...common} d={arc(s.start, s.end)} />
            );
          })
        )}
      </svg>
      {children && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[22%] text-center">
          {children}
        </div>
      )}
    </div>
  );
}
