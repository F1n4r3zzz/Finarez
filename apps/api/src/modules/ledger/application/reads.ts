import {
  type CurrencyCode,
  type LocalDate,
  parseCurrencyCode,
  parseLocalDate,
} from '@finanz/kernel';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import type { AccountKind, SystemRole } from '../domain/kinds';
import { accounts, entries } from '../infra/schema';

/** One ledger entry, as the read models need it. */
export interface LedgerFact {
  occurredOn: LocalDate;
  accountId: string;
  accountKind: AccountKind;
  systemRole: SystemRole | null;
  currency: CurrencyCode;
  amountMinor: bigint;
  categoryId: string | null;
}

/** Every entry dated within [from, to] (posted transactions only: void ones have none). */
export async function factsBetween(
  tx: Executor,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<LedgerFact[]> {
  const rows = await tx
    .select({
      occurredOn: entries.occurredOn,
      accountId: entries.accountId,
      accountKind: entries.accountKind,
      systemRole: accounts.systemRole,
      currency: entries.currency,
      amountMinor: entries.amountMinor,
      categoryId: entries.categoryId,
    })
    .from(entries)
    .innerJoin(
      accounts,
      and(eq(accounts.userId, entries.userId), eq(accounts.id, entries.accountId)),
    )
    .where(
      ownedBy(entries.userId, userId, gte(entries.occurredOn, from), lte(entries.occurredOn, to)),
    );
  return rows.map((r) => ({
    ...r,
    occurredOn: parseLocalDate(r.occurredOn),
    currency: parseCurrencyCode(r.currency),
  }));
}

export interface AccountBalance {
  accountId: string;
  kind: 'asset' | 'liability';
  currency: CurrencyCode;
  balanceMinor: bigint;
}

/**
 * Native balance of each user account at the end of `on` (archived ones included, at zero if
 * nothing was ever posted). Optionally only some accounts.
 */
export async function balancesAsOf(
  tx: Executor,
  userId: string,
  on: LocalDate,
  accountIds?: readonly string[],
): Promise<AccountBalance[]> {
  const rows = await tx
    .select({
      accountId: accounts.id,
      kind: accounts.kind,
      currency: accounts.currency,
      balanceMinor: sql<string>`coalesce(sum(${entries.amountMinor}) filter (where ${entries.occurredOn} <= ${on}), 0)`,
    })
    .from(accounts)
    .leftJoin(entries, and(eq(entries.userId, accounts.userId), eq(entries.accountId, accounts.id)))
    .where(
      ownedBy(
        accounts.userId,
        userId,
        inArray(accounts.kind, ['asset', 'liability']),
        accountIds ? inArray(accounts.id, [...accountIds]) : undefined,
      ),
    )
    .groupBy(accounts.id, accounts.kind, accounts.currency);
  return rows.map((r) => ({
    accountId: r.accountId,
    kind: r.kind as AccountBalance['kind'],
    currency: parseCurrencyCode(r.currency),
    balanceMinor: BigInt(r.balanceMinor),
  }));
}
