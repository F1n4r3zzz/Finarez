import { type CurrencyCode, parseCurrencyCode } from '@finanz/kernel';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../../../db/client';
import { ownedBy } from '../../../db/tenancy';
import { uuidv7 } from '../../../platform/ids';
import { categoriesTable } from '../../categories';
import { SYSTEM_ROLE_KIND, type SystemRole } from '../domain/kinds';
import type { AccountRef, PlannedEntry, PostingAccount, PostingContext } from '../domain/posting';
import { accounts, entries, type transactions } from '../infra/schema';

/** Loads the accounts and categories a set of entries or drafts can name, for one user. */
export async function loadPostingContext(
  tx: Executor,
  userId: string,
  accountIds: readonly string[],
  categoryIds: readonly string[],
): Promise<PostingContext> {
  const accountRows = accountIds.length
    ? await tx
        .select()
        .from(accounts)
        .where(ownedBy(accounts.userId, userId, inArray(accounts.id, [...accountIds])))
    : [];
  const categoryRows = categoryIds.length
    ? await tx
        .select({ id: categoriesTable.id, kind: categoriesTable.kind })
        .from(categoriesTable)
        .where(
          ownedBy(categoriesTable.userId, userId, inArray(categoriesTable.id, [...categoryIds])),
        )
    : [];
  return {
    accounts: new Map<string, PostingAccount>(
      accountRows.map((a) => [
        a.id,
        {
          kind: a.kind,
          currency: parseCurrencyCode(a.currency),
          archived: a.archivedAt !== null,
          systemRole: a.systemRole,
        },
      ]),
    ),
    categories: new Map(categoryRows.map((c) => [c.id, c.kind])),
  };
}

const roleKey = (role: SystemRole, currency: CurrencyCode) => `${role}|${currency}`;

/** Finds (creating the first time) the hidden accounts the entries need, one per role and currency. */
export async function resolveSystemAccounts(
  tx: Executor,
  userId: string,
  refs: readonly AccountRef[],
): Promise<Map<string, string>> {
  const needed = new Map<string, { role: SystemRole; currency: CurrencyCode }>();
  for (const ref of refs) {
    if ('systemRole' in ref)
      needed.set(roleKey(ref.systemRole, ref.currency), {
        role: ref.systemRole,
        currency: ref.currency,
      });
  }
  const ids = new Map<string, string>();
  for (const [key, { role, currency }] of needed) {
    await tx
      .insert(accounts)
      .values({
        userId,
        id: uuidv7(),
        kind: SYSTEM_ROLE_KIND[role],
        subtype: null,
        currency,
        name: `${role} ${currency}`,
        openedOn: '1900-01-01',
        systemRole: role,
      })
      .onConflictDoNothing({
        target: [accounts.userId, accounts.systemRole, accounts.currency],
        where: sql`${accounts.systemRole} is not null`,
      });
    const [row] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        ownedBy(
          accounts.userId,
          userId,
          and(eq(accounts.systemRole, role), eq(accounts.currency, currency)),
        ),
      );
    if (!row) throw new Error('System account missing after insert');
    ids.set(key, row.id);
  }
  return ids;
}

export function accountIdOf(ref: AccountRef, system: ReadonlyMap<string, string>): string {
  if ('accountId' in ref) return ref.accountId;
  const id = system.get(roleKey(ref.systemRole, ref.currency));
  if (!id) throw new Error('Unresolved system account');
  return id;
}

export type EntryRow = typeof entries.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;

export async function entriesOf(
  tx: Executor,
  userId: string,
  transactionId: string,
): Promise<EntryRow[]> {
  return tx
    .select()
    .from(entries)
    .where(ownedBy(entries.userId, userId, eq(entries.transactionId, transactionId)))
    .orderBy(asc(entries.id));
}

export async function insertEntries(
  tx: Executor,
  userId: string,
  transactionId: string,
  occurredOn: string,
  planned: readonly (PlannedEntry & {
    accountId: string;
    id?: string;
    reconciledAt?: Date | null;
  })[],
): Promise<void> {
  if (planned.length === 0) return;
  await tx.insert(entries).values(
    planned.map((e) => ({
      userId,
      id: e.id ?? uuidv7(),
      transactionId,
      occurredOn,
      accountId: e.accountId,
      accountKind: e.accountKind,
      currency: e.currency,
      amountMinor: e.amountMinor,
      categoryId: e.categoryId,
      categoryKind: e.categoryId ? (e.accountKind as 'income' | 'expense') : null,
      memo: e.memo,
      reconciledAt: e.reconciledAt ?? null,
    })),
  );
}

/** Snapshot of a transaction for the audit history (header plus its full entry set). */
export function snapshot(header: TransactionRow, rows: readonly EntryRow[]) {
  return {
    header: {
      occurredOn: header.occurredOn,
      kind: header.kind,
      status: header.status,
      managedBy: header.managedBy,
      description: header.description,
      payee: header.payee,
      notes: header.notes,
    },
    entries: rows.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      accountKind: e.accountKind,
      currency: e.currency,
      amountMinor: e.amountMinor.toString(),
      categoryId: e.categoryId,
      memo: e.memo,
      reconciled: e.reconciledAt !== null,
    })),
  };
}

export type Snapshot = ReturnType<typeof snapshot>;
