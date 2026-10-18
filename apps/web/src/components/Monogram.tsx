import type { ReactNode } from 'react';
import { monogram } from '../lib/monogram';

const TONES = {
  neutral: 'bg-brand-soft text-brand',
  income: 'bg-income-soft text-income',
  debt: 'bg-expense-soft text-expense-strong',
  plain: 'border border-line bg-hover text-muted',
} as const;

interface MonogramProps {
  /** The account or category name the two letters come from. */
  name: string;
  tone?: keyof typeof TONES;
  /** An icon instead of letters (a transfer, a recurring movement). */
  icon?: ReactNode;
  size?: 'md' | 'sm';
}

/** A small badge with two letters (or an icon) beside a name in lists and tiles. */
export function Monogram({ name, tone = 'neutral', icon, size = 'md' }: MonogramProps) {
  const box =
    size === 'md' ? 'size-[38px] rounded-xl text-sm' : 'size-[34px] rounded-[11px] text-[13px]';
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-bold ${box} ${TONES[tone]}`}
    >
      {icon ?? monogram(name)}
    </span>
  );
}
