import { z } from 'zod';
import { currencyCodeSchema } from './primitives';

export const SUPPORTED_LANGUAGES = ['es'] as const;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A user's display and calendar preferences. Every field is required when saving. */
export const preferencesSchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES),
  timeZone: z.string().refine(isTimeZone, { message: 'Unknown IANA time zone' }),
  primaryCurrency: currencyCodeSchema,
});

export type Preferences = z.infer<typeof preferencesSchema>;
