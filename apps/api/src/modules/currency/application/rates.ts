import type { RateInput, RateRevision, UserRate } from '@finanz/contracts';
import { parseCurrencyCode, parseLocalDate, parseRate } from '@finanz/kernel';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { uuidv7 } from '../../../platform/ids';
import { RateBook, type RateRow } from '../domain/rate-book';
import { providerRates, userRates } from '../infra/schema';

export class RateNotFoundError extends Error {
  constructor() {
    super('Rate not found');
    this.name = 'RateNotFoundError';
  }
}

/** A rate for this pair already starts that day: correct it instead of adding another. */
export class RateSameDayError extends Error {
  constructor() {
    super('A rate for this pair already starts that day');
    this.name = 'RateSameDayError';
  }
}

/** The rate was corrected already: correct the newer revision instead. */
export class RateAlreadyRevisedError extends Error {
  constructor() {
    super('Rate already revised');
    this.name = 'RateAlreadyRevisedError';
  }
}

type UserRateRow = typeof userRates.$inferSelect;

function toUserRate(row: UserRateRow): UserRate {
  return {
    id: row.id,
    base: parseCurrencyCode(row.base),
    quote: parseCurrencyCode(row.quote),
    validFrom: parseLocalDate(row.validFrom),
    rate: normalizeRate(row.rate),
    note: row.note,
    supersedesId: row.supersedesId,
    recordedAt: row.recordedAt.toISOString(),
  };
}

/** Postgres returns numeric(38,18) with trailing zeros; show the canonical decimal. */
function normalizeRate(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

const newer = alias(userRates, 'newer');

/** Current revisions only (rows no other row supersedes). */
export async function listUserRates(db: Executor, userId: string): Promise<UserRate[]> {
  const rows = await db
    .select({ rate: userRates })
    .from(userRates)
    .leftJoin(newer, and(eq(newer.userId, userRates.userId), eq(newer.supersedesId, userRates.id)))
    .where(ownedBy(userRates.userId, userId, isNull(newer.id)))
    .orderBy(asc(userRates.base), asc(userRates.quote), desc(userRates.validFrom));
  return rows.map((r) => toUserRate(r.rate));
}

export async function addUserRate(
  db: Executor,
  userId: string,
  input: RateInput,
): Promise<UserRate> {
  parseRate(input.rate); // same rule as the contract, checked where the value is stored
  const current = await listUserRates(db, userId);
  if (
    current.some(
      (r) => r.base === input.base && r.quote === input.quote && r.validFrom === input.validFrom,
    )
  ) {
    throw new RateSameDayError();
  }
  const [row] = await db
    .insert(userRates)
    .values({ userId, id: uuidv7(), ...input, note: input.note ?? null })
    .returning();
  if (!row) throw new Error('Insert returned no row');
  return toUserRate(row);
}

/** Corrects a current rate by inserting a revision of the same pair. */
export async function reviseUserRate(
  db: Executor,
  userId: string,
  rateId: string,
  input: RateRevision,
): Promise<UserRate> {
  parseRate(input.rate);
  const [current] = await db
    .select()
    .from(userRates)
    .where(ownedBy(userRates.userId, userId, eq(userRates.id, rateId)));
  if (!current) throw new RateNotFoundError();
  const [row] = await db
    .insert(userRates)
    .values({
      userId,
      id: uuidv7(),
      base: current.base,
      quote: current.quote,
      ...input,
      note: input.note ?? null,
      supersedesId: current.id,
    })
    .onConflictDoNothing({ target: [userRates.userId, userRates.supersedesId] })
    .returning();
  if (!row) throw new RateAlreadyRevisedError();
  return toUserRate(row);
}

const newerProvider = alias(providerRates, 'newer_provider');

/** Every current rate the user can convert with: their own and the providers'. */
export async function loadRateBook(
  db: Executor,
  userId: string,
  providerPriority: readonly string[] = [],
): Promise<RateBook> {
  const own = await listUserRates(db, userId);
  const shared = await db
    .select({ rate: providerRates })
    .from(providerRates)
    .leftJoin(newerProvider, eq(newerProvider.supersedesId, providerRates.id))
    .where(isNull(newerProvider.id));
  const rows: RateRow[] = [
    ...own.map((r) => ({
      id: r.id,
      origin: 'user' as const,
      source: null,
      base: r.base,
      quote: r.quote,
      validFrom: r.validFrom,
      recordedAt: r.recordedAt,
      rate: parseRate(r.rate),
    })),
    ...shared.map(({ rate: r }) => ({
      id: r.id,
      origin: 'provider' as const,
      source: r.source,
      base: parseCurrencyCode(r.base),
      quote: parseCurrencyCode(r.quote),
      validFrom: parseLocalDate(r.validFrom),
      recordedAt: r.recordedAt.toISOString(),
      rate: parseRate(normalizeRate(r.rate)),
    })),
  ];
  return new RateBook(rows, providerPriority);
}
