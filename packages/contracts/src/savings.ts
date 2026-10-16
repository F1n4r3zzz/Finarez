import type { CurrencyCode, LocalDate } from '@finanz/kernel';
import { z } from 'zod';
import { currencyCodeSchema, localDateSchema } from './primitives';
import type { ExcludedView } from './reports';

const minor = z
  .string()
  .regex(/^[1-9]\d{0,18}$/, 'A positive whole number of minor units')
  .transform((v) => BigInt(v));

export const goalInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currency: currencyCodeSchema,
  targetMinor: minor,
  targetDate: localDateSchema.nullable().optional(),
});

/** The currency is fixed once the goal exists: its history is measured in it. */
export const goalUpdateSchema = goalInputSchema.omit({ currency: true }).partial();

export const allocationInputSchema = z.object({
  direction: z.enum(['contribute', 'withdraw']),
  /** The account whose money is set aside for the goal (or released from it). */
  accountId: z.uuid(),
  amountMinor: minor,
  occurredOn: localDateSchema,
  /** Contribute only: move the money from this account first; Finarez records the transfer. */
  fromAccountId: z.uuid().optional(),
  note: z.string().trim().min(1).max(200).optional(),
});

export type GoalInput = z.input<typeof goalInputSchema>;
export type GoalUpdate = z.input<typeof goalUpdateSchema>;
export type AllocationInput = z.input<typeof allocationInputSchema>;

export interface GoalView {
  id: string;
  name: string;
  currency: CurrencyCode;
  targetMinor: string;
  targetDate: LocalDate | null;
  archived: boolean;
  /** Set aside so far, in the goal's currency at today's rates. */
  savedMinor: string;
  /** What is set aside in each account, in that account's currency. */
  byAccount: { accountId: string; amountMinor: string }[];
  /** To reach the target by its date, saving the same amount each month; null without a date. */
  monthlyNeededMinor: string | null;
  /** Amounts left out of `savedMinor` because no rate converts them. */
  excluded: ExcludedView[];
}

export interface AllocationView {
  id: string;
  goalId: string;
  accountId: string;
  /** Positive: set aside. Negative: released. In the account's currency. */
  amountMinor: string;
  occurredOn: LocalDate;
  note: string | null;
  /** The transfer Finarez recorded when the contribution moved money. */
  transactionId: string | null;
  voided: boolean;
}

export interface SavingsAccountView {
  accountId: string;
  currency: CurrencyCode;
  balanceMinor: string;
  /** Set aside for goals. */
  allocatedMinor: string;
  /** Balance minus what is set aside; negative when more is set aside than there is. */
  availableMinor: string;
}
