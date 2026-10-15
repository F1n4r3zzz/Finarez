import { type CurrencyCode, isCurrencyCode, type LocalDate, parseLocalDate } from '@finanz/kernel';
import { z } from 'zod';

export const currencyCodeSchema = z.custom<CurrencyCode>(
  (v) => typeof v === 'string' && isCurrencyCode(v),
  { message: 'Unsupported currency' },
);

/** A calendar date, "2026-10-14". */
export const localDateSchema = z.custom<LocalDate>(
  (v) => {
    if (typeof v !== 'string') return false;
    try {
      parseLocalDate(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Invalid calendar date (YYYY-MM-DD)' },
);
