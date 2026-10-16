import type { CurrencyCode, LocalDate } from '@finanz/kernel';
import { z } from 'zod';
import { currencyCodeSchema, localDateSchema } from './primitives';
import type { ExcludedView } from './reports';

const minor = z
  .string()
  .regex(/^[1-9]\d{0,18}$/, 'A positive whole number of minor units')
  .transform((v) => BigInt(v));

export const BUDGET_PERIODS = ['monthly', 'quarterly', 'yearly'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const budgetInputSchema = z.object({
  /** An expense category; its subcategories count toward the budget too. */
  categoryId: z.uuid(),
  period: z.enum(BUDGET_PERIODS),
  /** Fixed once the budget exists: its history is measured in it. */
  currency: currencyCodeSchema,
  amountMinor: minor,
  /** What is left (or overspent) in one period moves into the next. */
  carryover: z.boolean().optional(),
  /** Any day of the first period; the budget starts at that period's first day. */
  startsOn: localDateSchema.optional(),
});

export const budgetUpdateSchema = z
  .object({
    amountMinor: minor.optional(),
    /** Any day of the first period the new limit applies to; later periods follow it. */
    from: localDateSchema.optional(),
    carryover: z.boolean().optional(),
  })
  .refine((u) => u.amountMinor !== undefined || u.carryover !== undefined, {
    message: 'Nothing to change',
  })
  .refine((u) => u.from === undefined || u.amountMinor !== undefined, {
    message: '`from` goes with a new amount',
    path: ['from'],
  });

export type BudgetInput = z.input<typeof budgetInputSchema>;
export type BudgetUpdate = z.input<typeof budgetUpdateSchema>;

/** One period of a budget, in the budget's currency. */
export interface BudgetPeriodView {
  from: LocalDate;
  to: LocalDate;
  limitMinor: string;
  /** Left over (positive) or overspent (negative) in earlier periods; 0 without carryover. */
  carriedMinor: string;
  /** Limit plus what was carried. */
  availableMinor: string;
  /** Expenses of the category and its subcategories; refunds reduce it. */
  spentMinor: string;
  /** Available minus spent; negative when overspent. */
  remainingMinor: string;
  overspent: boolean;
  /** Expenses left out of `spentMinor` because no rate converts them. */
  excluded: ExcludedView[];
}

export interface BudgetView {
  id: string;
  categoryId: string;
  period: BudgetPeriod;
  currency: CurrencyCode;
  carryover: boolean;
  startsOn: LocalDate;
  archived: boolean;
  /** The limit for the period asked for; before the budget starts, its first limit. */
  limitMinor: string;
  /** The period asked for (today's by default); null before the budget starts. */
  current: BudgetPeriodView | null;
}
