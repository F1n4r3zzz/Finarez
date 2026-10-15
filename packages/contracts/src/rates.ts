import type { CurrencyCode, LocalDate } from '@finanz/kernel';
import { z } from 'zod';
import { currencyCodeSchema, localDateSchema } from './primitives';

/** "1 base = rate quote", as an exact decimal string with up to 18 decimals. */
const rateValueSchema = z
  .string()
  .regex(/^\d{1,20}(\.\d{1,18})?$/, 'Use a positive decimal like 4012.5')
  .refine((v) => /[1-9]/.test(v), 'An exchange rate must be above 0');

export const rateInputSchema = z
  .object({
    base: currencyCodeSchema,
    quote: currencyCodeSchema,
    validFrom: localDateSchema,
    rate: rateValueSchema,
    note: z.string().trim().max(200).optional(),
  })
  .refine((r) => r.base !== r.quote, {
    path: ['quote'],
    message: 'Choose two different currencies',
  });

/** A correction: same pair, new value and/or start date. */
export const rateRevisionSchema = z.object({
  validFrom: localDateSchema,
  rate: rateValueSchema,
  note: z.string().trim().max(200).optional(),
});

export type RateInput = z.infer<typeof rateInputSchema>;
export type RateRevision = z.infer<typeof rateRevisionSchema>;

export interface UserRate {
  id: string;
  base: CurrencyCode;
  quote: CurrencyCode;
  validFrom: LocalDate;
  rate: string;
  note: string | null;
  supersedesId: string | null;
  recordedAt: string;
}
