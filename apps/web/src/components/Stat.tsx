import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatPercent } from '../lib/percent';

export interface Delta {
  /** Change vs. the comparison period as a ratio (0.12 = +12 %). */
  ratio: number;
  /** Text naming the comparison period, e.g. "frente a septiembre". */
  label: string;
  /** Whether a rise is good news for this figure (income: yes, spending: no). */
  upIsGood: boolean;
}

interface StatProps {
  label: string;
  value: ReactNode;
  delta?: Delta;
}

/** One figure inside a <dl>: label, value and an optional change vs. a named period. */
export function Stat({ label, value, delta }: StatProps) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="amount mt-1 text-xl md:text-2xl">{value}</dd>
      {delta && <DeltaBadge delta={delta} />}
    </div>
  );
}

/** The change as a badge colored by whether it is good news, then the period it compares with. */
export function DeltaBadge({ delta, as: Tag = 'dd' }: { delta: Delta; as?: 'dd' | 'p' }) {
  const up = delta.ratio >= 0;
  const good = up === delta.upIsGood;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <Tag className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
      <span
        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium ${
          good ? 'bg-income-soft text-income' : 'bg-expense-soft text-expense'
        }`}
      >
        <Arrow size={14} aria-hidden="true" />
        <span className="amount">{formatPercent(delta.ratio)}</span>
      </span>
      {delta.label}
    </Tag>
  );
}
