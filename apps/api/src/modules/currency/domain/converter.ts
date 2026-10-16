import { type CurrencyCode, convertMinor, type LocalDate, minorUnits } from '@finanz/kernel';
import type { RateBook } from './rate-book';

/** A part of a figure left out because no rate was found for that currency on that day. */
export interface Excluded {
  date: LocalDate;
  currency: CurrencyCode;
  component: string;
  amountMinor: bigint;
}

/** Converts amounts one by one (policy v1) and remembers what couldn't be converted. */
export class Converter {
  readonly excluded: Excluded[] = [];
  readonly rateIds = new Set<string>();
  /** Rates used although older than the staleness limit on that day (still exact, maybe outdated). */
  readonly staleRateIds = new Set<string>();

  constructor(
    private readonly book: RateBook,
    readonly target: CurrencyCode,
  ) {}

  convert(amountMinor: bigint, currency: CurrencyCode, on: LocalDate, component: string): bigint {
    const quote = this.book.find(currency, this.target, on);
    if (!quote) {
      this.excluded.push({ date: on, currency, component, amountMinor });
      return 0n;
    }
    for (const leg of quote.legs) {
      this.rateIds.add(leg.rateId);
      if (quote.stale) this.staleRateIds.add(leg.rateId);
    }
    return convertMinor(amountMinor, minorUnits(currency), minorUnits(this.target), quote.rate);
  }

  get complete(): boolean {
    return this.excluded.length === 0;
  }
}
