import type { CurrencyCode, LocalDate } from '@finanz/kernel';
import { asc, eq, isNull } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { uuidv7 } from '../../../platform/ids';
import { type AccountSubtype, ASSET_SUBTYPES } from '../domain/kinds';
import { LedgerError, planOpening } from '../domain/posting';
import { accounts } from '../infra/schema';
import { type Actor, postTransaction } from './transactions';

export interface NewAccount {
  name: string;
  subtype: AccountSubtype;
  currency: CurrencyCode;
  institution?: string | null;
  openedOn: LocalDate;
  /** Signed: what the account holds (+) or owes (−) on the opening day. */
  openingBalanceMinor?: bigint;
}

export type AccountRow = typeof accounts.$inferSelect;

const kindOf = (subtype: AccountSubtype) =>
  (ASSET_SUBTYPES as readonly string[]).includes(subtype)
    ? ('asset' as const)
    : ('liability' as const);

/** Creates a user account and, when given, its opening balance as a first transaction. */
export async function createAccount(
  tx: Executor,
  actor: Actor,
  input: NewAccount,
): Promise<AccountRow> {
  const kind = kindOf(input.subtype);
  const [row] = await tx
    .insert(accounts)
    .values({
      userId: actor.userId,
      id: uuidv7(),
      kind,
      subtype: input.subtype,
      currency: input.currency,
      name: input.name,
      institution: input.institution ?? null,
      openedOn: input.openedOn,
    })
    .returning();
  if (!row) throw new Error('Insert returned no row');
  if (input.openingBalanceMinor) {
    await postTransaction(
      tx,
      actor,
      planOpening(
        row.id,
        { kind, currency: input.currency },
        input.openingBalanceMinor,
        input.openedOn,
      ),
    );
  }
  return row;
}

/** The user's own accounts (never the hidden system ones), archived ones included. */
export async function listAccounts(tx: Executor, userId: string): Promise<AccountRow[]> {
  return tx
    .select()
    .from(accounts)
    .where(ownedBy(accounts.userId, userId, isNull(accounts.systemRole)))
    .orderBy(asc(accounts.name));
}

export async function updateAccount(
  tx: Executor,
  userId: string,
  id: string,
  changes: { name?: string; institution?: string | null; archived?: boolean },
): Promise<AccountRow> {
  const set: Partial<typeof accounts.$inferInsert> = { updatedAt: new Date() };
  if (changes.name !== undefined) set.name = changes.name;
  if (changes.institution !== undefined) set.institution = changes.institution;
  if (changes.archived !== undefined) set.archivedAt = changes.archived ? new Date() : null;
  const [row] = await tx
    .update(accounts)
    .set(set)
    .where(ownedBy(accounts.userId, userId, eq(accounts.id, id), isNull(accounts.systemRole)))
    .returning();
  // A route resource: unknown and foreign ids answer like any missing resource (404).
  if (!row) throw new LedgerError('ledger.not_found');
  return row;
}
