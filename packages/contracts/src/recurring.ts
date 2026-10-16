import { type CurrencyCode, FREQUENCIES, type Frequency, type LocalDate } from '@finanz/kernel';
import { z } from 'zod';
import { type DraftInput, draftSchema } from './ledger';
import { localDateSchema } from './primitives';

const positiveMinor = z
  .string()
  .regex(/^[1-9]\d{0,18}$/, 'A positive whole number of minor units')
  .transform((v) => BigInt(v));
const day = z.number().int().min(1).max(31);

export const ruleInputSchema = z
  .object({
    /** The first movement; its date is the first time the rule happens. */
    draft: draftSchema,
    frequency: z.enum(FREQUENCIES),
    /** Twice a month: the other day of the month (the draft's date gives the first). */
    secondDay: day.nullable().optional(),
    /** The last day it may happen on; none means until it is ended. */
    endsOn: localDateSchema.nullable().optional(),
    /** Wait for the user to confirm (and adjust) each time instead of recording it. */
    confirm: z.boolean().optional(),
  })
  .refine((r) => r.draft.kind !== 'adjustment', {
    message: 'Only income, expenses and transfers repeat',
    path: ['draft', 'kind'],
  })
  .refine((r) => (r.frequency === 'twice_monthly') === (r.secondDay != null), {
    message: 'Twice a month needs a second day, and only it',
    path: ['secondDay'],
  })
  .refine((r) => !r.endsOn || r.endsOn >= r.draft.occurredOn, {
    message: 'Ends before it starts',
    path: ['endsOn'],
  });

export const ruleUpdateSchema = z
  .object({
    description: z.string().trim().min(1).max(200).optional(),
    /** Only for rules that move one amount: one category line, or a same-currency transfer. */
    amountMinor: positiveMinor.optional(),
    frequency: z.enum(FREQUENCIES).optional(),
    secondDay: day.nullable().optional(),
    /** The next time it happens; also the new anchor when the schedule changes. */
    nextDueOn: localDateSchema.optional(),
    endsOn: localDateSchema.nullable().optional(),
    confirm: z.boolean().optional(),
  })
  .refine((u) => Object.keys(u).length > 0, { message: 'Nothing to change' });

export const confirmOccurrenceSchema = z.object({
  /** A different amount this time (single-amount rules only). */
  amountMinor: positiveMinor.optional(),
  /** When it really happened, if not on its due date. */
  occurredOn: localDateSchema.optional(),
});

export type RuleInput = z.input<typeof ruleInputSchema>;
export type RuleUpdate = z.input<typeof ruleUpdateSchema>;
export type ConfirmOccurrence = z.input<typeof confirmOccurrenceSchema>;

type WithoutDate<T> = T extends unknown ? Omit<T, 'occurredOn'> : never;
/** The movement a rule repeats: an income, expense or transfer, without its date. */
export type RecurringTemplate = WithoutDate<Exclude<DraftInput, { kind: 'adjustment' }>>;

export interface RuleView {
  id: string;
  template: RecurringTemplate;
  frequency: Frequency;
  anchorOn: LocalDate;
  secondDay: number | null;
  /** The next time it happens; after `endsOn` once it has ended. */
  nextDueOn: LocalDate;
  endsOn: LocalDate | null;
  confirm: boolean;
  /** Ended by the user, or past its last day. */
  ended: boolean;
  /** Occurrences waiting for the user. */
  pending: number;
  /** The amount it moves when there is one (see `ruleUpdateSchema`), in `currency`. */
  amountMinor: string | null;
  currency: CurrencyCode;
}

export interface OccurrenceView {
  ruleId: string;
  dueOn: LocalDate;
  status: 'pending' | 'posted' | 'skipped';
  transactionId: string | null;
  /** Why an automatic one couldn't be recorded (a ledger error code), so it waits instead. */
  error: string | null;
  description: string;
  amountMinor: string | null;
  currency: CurrencyCode;
}

export interface RunResult {
  /** Recorded now. */
  posted: number;
  /** Waiting for the user in total, after this run. */
  pending: number;
}
