import type { CurrencyCode, LocalDate } from '@finanz/kernel';
import { z } from 'zod';
import { currencyCodeSchema, localDateSchema } from './primitives';

const minor = z
  .string()
  .regex(/^[1-9]\d{0,18}$/, 'A positive whole number of minor units')
  .transform((v) => BigInt(v));
const minorOrZero = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/, 'A whole number of minor units')
  .transform((v) => BigInt(v));
/** A rate as a decimal fraction: "0.012" is 1,2 %. */
const rate = z.string().regex(/^\d{1,8}(\.\d{1,12})?$/, 'A decimal like 0.012');

export const debtTermsSchema = z.object({
  rate: rate.nullable().optional(),
  ratePeriod: z.enum(['monthly', 'annual']).nullable().optional(),
  originalPrincipalMinor: minor.nullable().optional(),
  termMonths: z.number().int().min(1).max(600).nullable().optional(),
  installmentMinor: minor.nullable().optional(),
  startOn: localDateSchema.nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  statementDay: z.number().int().min(1).max(31).nullable().optional(),
  creditLimitMinor: minor.nullable().optional(),
  interestCategoryId: z.uuid().nullable().optional(),
});

export const debtInputSchema = debtTermsSchema.extend({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['loan', 'credit_card']),
  currency: currencyCodeSchema,
  institution: z.string().trim().max(80).nullable().optional(),
  /** The day you start tracking it here. */
  openedOn: localDateSchema,
  /** What you owe that day (positive). */
  outstandingMinor: minorOrZero,
});

export const paymentInputSchema = z.object({
  fromAccountId: z.uuid(),
  paidOn: localDateSchema,
  amountMinor: minor,
  /** Leave out to use the proposed split. */
  interestMinor: minorOrZero.optional(),
  feesMinor: minorOrZero.optional(),
  feeCategoryId: z.uuid().optional(),
  description: z.string().trim().min(1).max(200).optional(),
});

export const paymentEditSchema = paymentInputSchema.extend({ version: z.number().int().min(1) });

export type DebtInput = z.input<typeof debtInputSchema>;
export type DebtTermsInput = z.input<typeof debtTermsSchema>;
export type PaymentInput = z.input<typeof paymentInputSchema>;

export interface DebtView {
  id: string;
  accountId: string;
  name: string;
  type: 'loan' | 'credit_card';
  currency: CurrencyCode;
  /** What is owed today (positive). */
  outstandingMinor: string;
  rate: string | null;
  ratePeriod: 'monthly' | 'annual' | null;
  originalPrincipalMinor: string | null;
  termMonths: number | null;
  installmentMinor: string | null;
  startOn: LocalDate | null;
  dueDay: number | null;
  statementDay: number | null;
  creditLimitMinor: string | null;
  interestCategoryId: string | null;
  nextDueOn: LocalDate | null;
  archived: boolean;
}

export interface PaymentView {
  transactionId: string;
  version: number;
  status: 'posted' | 'void';
  paidOn: LocalDate;
  description: string;
  fromAccountId: string | null;
  amountMinor: string;
  principalMinor: string;
  interestMinor: string;
  feesMinor: string;
}

export interface ProposalView {
  outstandingMinor: string;
  interestMinor: string;
  principalMinor: string;
}

export interface ScheduleView {
  rows: {
    dueOn: LocalDate;
    installmentMinor: string;
    interestMinor: string;
    principalMinor: string;
    balanceAfterMinor: string;
  }[];
  /** The installment never covers the interest: the debt would never be paid. */
  neverEnds: boolean;
}
