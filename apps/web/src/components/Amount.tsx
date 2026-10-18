import type { Money } from '@finanz/kernel';
import { formatMoney } from '../lib/money';

interface AmountProps {
  value: Money;
  /** Show "+" / "−" and color income green; spending stays in ink (red is for alarms). */
  signed?: boolean;
  className?: string;
}

export function Amount({ value, signed = false, className = '' }: AmountProps) {
  let tone = '';
  if (signed && value.amountMinor > 0n) tone = 'text-income';
  return (
    <span className={`amount whitespace-nowrap ${tone} ${className}`}>
      {formatMoney(value, { signDisplay: signed ? 'exceptZero' : 'auto' })}
    </span>
  );
}
