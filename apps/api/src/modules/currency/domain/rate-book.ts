import {
  type CurrencyCode,
  daysBetween,
  type ExactRate,
  invertRate,
  type LocalDate,
  multiplyRates,
  parseRate,
} from '@finanz/kernel';

/** A current (unsuperseded) rate revision: 1 `base` = `rate` `quote` from `validFrom`. */
export interface RateRow {
  id: string;
  origin: 'user' | 'provider';
  /** Provider name; null for user rates. */
  source: string | null;
  base: CurrencyCode;
  quote: CurrencyCode;
  validFrom: LocalDate;
  rate: ExactRate;
}

export interface RateLeg {
  rateId: string;
  origin: RateRow['origin'];
  inverted: boolean;
  validFrom: LocalDate;
}

/** The rate chosen to convert `from` into `to` on a day, and how it was obtained. */
export interface RateQuote {
  rate: ExactRate;
  /** Empty for same-currency conversions. */
  legs: RateLeg[];
  /** Some leg is older than the staleness limit on that day. */
  stale: boolean;
}

const IDENTITY = parseRate('1');
const STALE_AFTER_DAYS = 45;

/**
 * Picks rates deterministically (data-model §2.1): user rate for the pair (direct, then
 * inverse); provider rate by source priority (direct, then inverse); otherwise through USD,
 * each leg chosen the same way. A rate applies from its `validFrom` until the next one.
 */
export class RateBook {
  private readonly byKey = new Map<string, RateRow[]>();

  constructor(
    rows: readonly RateRow[],
    private readonly providerPriority: readonly string[] = [],
  ) {
    for (const row of rows) {
      const key = this.key(row.origin, row.source, row.base, row.quote);
      const list = this.byKey.get(key) ?? [];
      list.push(row);
      this.byKey.set(key, list);
    }
    for (const list of this.byKey.values()) {
      list.sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1)); // newest first
    }
  }

  find(from: CurrencyCode, to: CurrencyCode, on: LocalDate): RateQuote | undefined {
    if (from === to) return { rate: IDENTITY, legs: [], stale: false };
    const direct = this.pair(from, to, on);
    if (direct) return direct;
    if (from === 'USD' || to === 'USD') return undefined;
    const first = this.pair(from, 'USD', on);
    const second = this.pair('USD', to, on);
    if (!first || !second) return undefined;
    return {
      rate: multiplyRates(first.rate, second.rate),
      legs: [...first.legs, ...second.legs],
      stale: first.stale || second.stale,
    };
  }

  private pair(from: CurrencyCode, to: CurrencyCode, on: LocalDate): RateQuote | undefined {
    const candidates: [RateRow['origin'], string | null][] = [
      ['user', null],
      ...this.providerPriority.map((source): [RateRow['origin'], string] => ['provider', source]),
    ];
    for (const [origin, source] of candidates) {
      const direct = this.applicable(origin, source, from, to, on);
      if (direct) return this.quote(direct, false, on);
      const inverse = this.applicable(origin, source, to, from, on);
      if (inverse) return this.quote(inverse, true, on);
    }
    return undefined;
  }

  private applicable(
    origin: RateRow['origin'],
    source: string | null,
    base: CurrencyCode,
    quote: CurrencyCode,
    on: LocalDate,
  ): RateRow | undefined {
    return this.byKey.get(this.key(origin, source, base, quote))?.find((r) => r.validFrom <= on);
  }

  private quote(row: RateRow, inverted: boolean, on: LocalDate): RateQuote {
    return {
      rate: inverted ? invertRate(row.rate) : row.rate,
      legs: [{ rateId: row.id, origin: row.origin, inverted, validFrom: row.validFrom }],
      stale: daysBetween(row.validFrom, on) > STALE_AFTER_DAYS,
    };
  }

  private key(origin: string, source: string | null, base: string, quote: string): string {
    return `${origin}|${source ?? ''}|${base}|${quote}`;
  }
}
