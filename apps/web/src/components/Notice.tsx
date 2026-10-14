import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ReactNode } from 'react';

const TONES = {
  success: { icon: CircleCheck, box: 'bg-income-soft', mark: 'text-income' },
  info: { icon: Info, box: 'bg-brand-soft', mark: 'text-brand' },
  error: { icon: CircleAlert, box: 'bg-expense-soft', mark: 'text-expense' },
} as const;

interface NoticeProps {
  tone: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}

/** A short message about what just happened. Errors interrupt screen readers; others wait. */
export function Notice({ tone, children, className = '' }: NoticeProps) {
  const { icon: Icon, box, mark } = TONES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-lg px-4 py-3 text-ink text-sm ${box} ${className}`}
    >
      <Icon size={18} aria-hidden="true" className={`mt-px shrink-0 ${mark}`} />
      <div className="grid gap-2">{children}</div>
    </div>
  );
}
