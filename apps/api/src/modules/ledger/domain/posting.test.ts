import { type CurrencyCode, parseLocalDate } from '@finanz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AccountKind } from './kinds';
import {
  type Draft,
  LedgerError,
  type PlannedEntry,
  type PostingAccount,
  type PostingContext,
  planOpening,
  planTransaction,
} from './posting';

const day = parseLocalDate('2026-03-10');
const acct = (kind: AccountKind, currency: CurrencyCode, archived = false): PostingAccount => ({
  kind,
  currency,
  archived,
  systemRole: null,
});

const ctx: PostingContext = {
  accounts: new Map<string, PostingAccount>([
    ['bank', acct('asset', 'COP')],
    ['nequi', acct('asset', 'COP')],
    ['visa', acct('liability', 'COP')],
    ['wise', acct('asset', 'USD')],
    ['old', acct('asset', 'COP', true)],
    ['hidden', { kind: 'expense', currency: 'COP', archived: false, systemRole: 'expense' }],
  ]),
  categories: new Map<string, 'income' | 'expense'>([
    ['mercado', 'expense'],
    ['hogar', 'expense'],
    ['comisiones', 'expense'],
    ['ajustes-gasto', 'expense'],
    ['servicios', 'income'],
    ['ajustes-ingreso', 'income'],
  ]),
};

/** Entries in a compact, readable form: account, amount, category. */
const show = (entries: PlannedEntry[]) =>
  entries.map((e) => [
    'accountId' in e.account
      ? e.account.accountId
      : `→${e.account.systemRole}(${e.account.currency})`,
    e.amountMinor,
    e.categoryId,
  ]);

const base = { occurredOn: day, description: 'Prueba' };

function refusal(draft: Draft): string {
  try {
    planTransaction(draft, ctx);
  } catch (error) {
    if (error instanceof LedgerError) return error.code;
    throw error;
  }
  throw new Error('Expected a refusal');
}

describe('posting recipes (data-model §5)', () => {
  it('expense paid by card', () => {
    const plan = planTransaction(
      {
        ...base,
        kind: 'expense',
        accountId: 'visa',
        lines: [{ categoryId: 'mercado', amountMinor: 50_000_00n }],
      },
      ctx,
    );
    expect(show(plan.entries)).toEqual([
      ['visa', -50_000_00n, null],
      ['→expense(COP)', 50_000_00n, 'mercado'],
    ]);
  });

  it('split receipt: one bank movement, two categories', () => {
    const plan = planTransaction(
      {
        ...base,
        kind: 'expense',
        accountId: 'bank',
        lines: [
          { categoryId: 'mercado', amountMinor: 225_000_00n },
          { categoryId: 'hogar', amountMinor: 85_000_00n },
        ],
      },
      ctx,
    );
    expect(show(plan.entries)).toEqual([
      ['bank', -310_000_00n, null],
      ['→expense(COP)', 225_000_00n, 'mercado'],
      ['→expense(COP)', 85_000_00n, 'hogar'],
    ]);
  });

  it('refund: money back reduces the category', () => {
    const plan = planTransaction(
      {
        ...base,
        kind: 'expense',
        accountId: 'bank',
        lines: [{ categoryId: 'hogar', amountMinor: -120_000_00n }],
      },
      ctx,
    );
    expect(show(plan.entries)).toEqual([
      ['bank', 120_000_00n, null],
      ['→expense(COP)', -120_000_00n, 'hogar'],
    ]);
  });

  it('income', () => {
    const plan = planTransaction(
      {
        ...base,
        kind: 'income',
        accountId: 'bank',
        lines: [{ categoryId: 'servicios', amountMinor: 24_000_000_00n }],
      },
      ctx,
    );
    expect(show(plan.entries)).toEqual([
      ['bank', 24_000_000_00n, null],
      ['→income(COP)', -24_000_000_00n, 'servicios'],
    ]);
  });

  it('transfer and card payment touch no income or expense', () => {
    const plan = planTransaction(
      {
        ...base,
        kind: 'transfer',
        from: { accountId: 'bank', amountMinor: 3_485_922_00n },
        to: { accountId: 'visa', amountMinor: 3_485_922_00n },
      },
      ctx,
    );
    expect(show(plan.entries)).toEqual([
      ['bank', -3_485_922_00n, null],
      ['visa', 3_485_922_00n, null],
    ]);
  });

  it('cross-currency transfer with a fee in the same bank movement', () => {
    const plan = planTransaction(
      {
        ...base,
        kind: 'transfer',
        from: { accountId: 'wise', amountMinor: 1_000_00n },
        to: { accountId: 'bank', amountMinor: 4_010_000_00n },
        fee: { amountMinor: 5_00n, categoryId: 'comisiones' },
      },
      ctx,
    );
    expect(show(plan.entries)).toEqual([
      ['wise', -1_005_00n, null],
      ['→fx(USD)', 1_000_00n, null],
      ['→fx(COP)', -4_010_000_00n, null],
      ['bank', 4_010_000_00n, null],
      ['→expense(USD)', 5_00n, 'comisiones'],
    ]);
  });

  it('balance correction goes through an Ajustes category of the right kind', () => {
    const up = planTransaction(
      {
        ...base,
        kind: 'adjustment',
        accountId: 'bank',
        amountMinor: 1_000_00n,
        categoryId: 'ajustes-ingreso',
      },
      ctx,
    );
    expect(show(up.entries)).toEqual([
      ['bank', 1_000_00n, null],
      ['→income(COP)', -1_000_00n, 'ajustes-ingreso'],
    ]);
    expect(
      refusal({
        ...base,
        kind: 'adjustment',
        accountId: 'bank',
        amountMinor: -5n,
        categoryId: 'ajustes-ingreso',
      }),
    ).toBe('ledger.category_kind');
  });

  it('opening balance against the hidden equity account', () => {
    const plan = planOpening('visa', { kind: 'liability', currency: 'COP' }, -2_340_000_00n, day);
    expect(show(plan.entries)).toEqual([
      ['visa', -2_340_000_00n, null],
      ['→opening_balance(COP)', 2_340_000_00n, null],
    ]);
  });
});

describe('refusals', () => {
  it.each<[string, Draft]>([
    [
      'ledger.account_not_found',
      {
        ...base,
        kind: 'expense',
        accountId: 'nope',
        lines: [{ categoryId: 'mercado', amountMinor: 1n }],
      },
    ],
    [
      'ledger.account_not_found',
      {
        ...base,
        kind: 'expense',
        accountId: 'hidden',
        lines: [{ categoryId: 'mercado', amountMinor: 1n }],
      },
    ],
    [
      'ledger.account_archived',
      {
        ...base,
        kind: 'expense',
        accountId: 'old',
        lines: [{ categoryId: 'mercado', amountMinor: 1n }],
      },
    ],
    [
      'ledger.category_not_found',
      {
        ...base,
        kind: 'expense',
        accountId: 'bank',
        lines: [{ categoryId: 'nope', amountMinor: 1n }],
      },
    ],
    [
      'ledger.category_kind',
      {
        ...base,
        kind: 'expense',
        accountId: 'bank',
        lines: [{ categoryId: 'servicios', amountMinor: 1n }],
      },
    ],
    ['ledger.amount_zero', { ...base, kind: 'expense', accountId: 'bank', lines: [] }],
    [
      'ledger.amount_zero',
      {
        ...base,
        kind: 'expense',
        accountId: 'bank',
        lines: [
          { categoryId: 'mercado', amountMinor: 5n },
          { categoryId: 'hogar', amountMinor: -5n },
        ],
      },
    ],
    [
      'ledger.same_account',
      {
        ...base,
        kind: 'transfer',
        from: { accountId: 'bank', amountMinor: 1n },
        to: { accountId: 'bank', amountMinor: 1n },
      },
    ],
    [
      'ledger.amounts_differ',
      {
        ...base,
        kind: 'transfer',
        from: { accountId: 'bank', amountMinor: 2n },
        to: { accountId: 'nequi', amountMinor: 1n },
      },
    ],
    [
      'ledger.amount_out_of_range',
      {
        ...base,
        kind: 'expense',
        accountId: 'bank',
        lines: [{ categoryId: 'mercado', amountMinor: 2n ** 63n }],
      },
    ],
  ])('%s', (code, draft) => {
    expect(refusal(draft)).toBe(code);
  });
});

describe('every plan balances in each currency', () => {
  const amount = fc.bigInt({ min: 1n, max: 10n ** 12n });
  const draft = fc.oneof(
    fc.record({
      kind: fc.constantFrom('expense' as const, 'income' as const),
      accountId: fc.constantFrom('bank', 'visa', 'wise'),
      lines: fc.array(amount, { minLength: 1, maxLength: 5 }),
    }),
    fc.record({
      kind: fc.constant('transfer' as const),
      sent: amount,
      received: amount,
      fee: fc.option(amount, { nil: undefined }),
    }),
  );

  it('holds for generated drafts', () => {
    fc.assert(
      fc.property(draft, (d) => {
        const plan =
          d.kind === 'transfer'
            ? planTransaction(
                {
                  ...base,
                  kind: 'transfer',
                  from: { accountId: 'wise', amountMinor: d.sent },
                  to: { accountId: 'bank', amountMinor: d.received },
                  fee: d.fee ? { amountMinor: d.fee, categoryId: 'comisiones' } : null,
                },
                ctx,
              )
            : planTransaction(
                {
                  ...base,
                  kind: d.kind,
                  accountId: d.accountId,
                  lines: d.lines.map((amountMinor) => ({
                    categoryId: d.kind === 'expense' ? 'mercado' : 'servicios',
                    amountMinor,
                  })),
                },
                ctx,
              );
        const totals = new Map<string, bigint>();
        for (const e of plan.entries)
          totals.set(e.currency, (totals.get(e.currency) ?? 0n) + e.amountMinor);
        for (const total of totals.values()) expect(total).toBe(0n);
        expect(plan.entries.length).toBeGreaterThanOrEqual(2);
      }),
    );
  });
});
