import type { CurrencyCode, LocalDate } from '@finanz/kernel';
import { z } from 'zod';
import { currencyCodeSchema, localDateSchema } from './primitives';

export const ASSET_SUBTYPES = [
  'bank',
  'cash',
  'wallet',
  'savings',
  'investment',
  'receivable',
  'other_asset',
] as const;
export const LIABILITY_SUBTYPES = ['credit_card', 'loan', 'payable', 'other_liability'] as const;
export const ACCOUNT_SUBTYPES = [...ASSET_SUBTYPES, ...LIABILITY_SUBTYPES] as const;
export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[number];

/** Minor units as a decimal string (never a JSON number); range is checked by the API. */
const minor = z
  .string()
  .regex(/^-?(0|[1-9]\d{0,18})$/, 'Minor units as a whole-number string')
  .transform((v) => BigInt(v));
const positiveMinor = z
  .string()
  .regex(/^[1-9]\d{0,18}$/, 'A positive whole number of minor units')
  .transform((v) => BigInt(v));
const id = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const accountInputSchema = z.object({
  name: text(80),
  subtype: z.enum(ACCOUNT_SUBTYPES),
  currency: currencyCodeSchema,
  institution: optionalText(80),
  openedOn: localDateSchema,
  /** What it holds (+) or owes (−) on the opening day. */
  openingBalanceMinor: minor.optional(),
});

export const accountUpdateSchema = z
  .object({
    name: text(80).optional(),
    institution: optionalText(80),
    archived: z.boolean().optional(),
  })
  .refine((u) => Object.keys(u).length > 0, { message: 'Nothing to change' });

const header = {
  occurredOn: localDateSchema,
  description: text(200),
  payee: optionalText(120),
  notes: optionalText(1000),
};

const line = z.object({ categoryId: id, amountMinor: minor, memo: optionalText(200) });

export const draftSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('expense'),
    accountId: id,
    lines: z.array(line).min(1).max(50),
    ...header,
  }),
  z.object({
    kind: z.literal('income'),
    accountId: id,
    lines: z.array(line).min(1).max(50),
    ...header,
  }),
  z.object({
    kind: z.literal('transfer'),
    from: z.object({ accountId: id, amountMinor: positiveMinor }),
    to: z.object({ accountId: id, amountMinor: positiveMinor }),
    fee: z.object({ amountMinor: positiveMinor, categoryId: id }).nullable().optional(),
    ...header,
  }),
  z.object({
    kind: z.literal('adjustment'),
    accountId: id,
    amountMinor: minor,
    categoryId: id,
    ...header,
  }),
]);

const version = z.number().int().min(1);

export const editTransactionSchema = z.object({
  version,
  draft: draftSchema,
  confirmReconciledChange: z.boolean().optional(),
});
export const voidTransactionSchema = z.object({
  version,
  confirmReconciledChange: z.boolean().optional(),
});
export const restoreTransactionSchema = z.object({ version });

export type AccountInput = z.infer<typeof accountInputSchema>;
export type DraftInput = z.input<typeof draftSchema>;

export interface AccountView {
  id: string;
  name: string;
  kind: 'asset' | 'liability';
  subtype: AccountSubtype;
  currency: CurrencyCode;
  institution: string | null;
  openedOn: LocalDate;
  archived: boolean;
  /** Balance today in the account's own currency (owed amounts are negative). */
  balanceMinor: string;
}

export interface EntryView {
  id: string;
  accountId: string;
  accountKind: 'asset' | 'liability' | 'income' | 'expense' | 'equity' | 'clearing';
  currency: CurrencyCode;
  amountMinor: string;
  categoryId: string | null;
  memo: string | null;
  reconciled: boolean;
}

export interface TransactionView {
  id: string;
  occurredOn: LocalDate;
  kind: 'income' | 'expense' | 'transfer' | 'adjustment' | 'opening' | 'valuation';
  status: 'posted' | 'void';
  managedBy: string | null;
  description: string;
  payee: string | null;
  notes: string | null;
  version: number;
  entries: EntryView[];
}
