import { type CurrencyCode, type LocalDate, parseLocalDate, parseRate } from '@finanz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RateBook, type RateRow } from '../../currency';
import type { AccountBalance, LedgerFact } from '../../ledger';
import { bridge, Converter, netWorth, summarize } from './figures';

const d = parseLocalDate;

function book(rates: [string, string, string][]): RateBook {
  return new RateBook(
    rates.map(
      ([pair, rate, validFrom], i): RateRow => ({
        id: `r${i}`,
        origin: 'user',
        source: null,
        base: pair.split('/')[0] as CurrencyCode,
        quote: pair.split('/')[1] as CurrencyCode,
        validFrom: d(validFrom),
        recordedAt: `${validFrom}T00:00:00Z`,
        rate: parseRate(rate),
      }),
    ),
  );
}

const fact = (
  date: string,
  accountId: string,
  accountKind: LedgerFact['accountKind'],
  currency: CurrencyCode,
  amountMinor: bigint,
  extra: Partial<LedgerFact> = {},
): LedgerFact => ({
  occurredOn: d(date),
  accountId,
  accountKind,
  systemRole: null,
  currency,
  amountMinor,
  categoryId: null,
  ...extra,
});

describe('summarize', () => {
  it('counts only income and expense lines; refunds reduce their category; transfers never count', () => {
    const facts = [
      fact('2026-01-05', 'bank', 'asset', 'COP', 24_000_000_00n),
      fact('2026-01-05', 'income', 'income', 'COP', -24_000_000_00n, { categoryId: 'servicios' }),
      fact('2026-01-06', 'bank', 'asset', 'COP', -310_000_00n),
      fact('2026-01-06', 'expense', 'expense', 'COP', 225_000_00n, { categoryId: 'mercado' }),
      fact('2026-01-06', 'expense', 'expense', 'COP', 85_000_00n, { categoryId: 'hogar' }),
      fact('2026-01-09', 'bank', 'asset', 'COP', 85_000_00n),
      fact('2026-01-09', 'expense', 'expense', 'COP', -85_000_00n, { categoryId: 'hogar' }),
      fact('2026-01-30', 'bank', 'asset', 'COP', -3_485_922_00n),
      fact('2026-01-30', 'visa', 'liability', 'COP', 3_485_922_00n),
    ];
    const s = summarize(facts, new Converter(book([]), 'COP'));
    expect(s.income).toBe(24_000_000_00n);
    expect(s.expenses).toBe(225_000_00n);
    expect(s.net).toBe(23_775_000_00n);
    expect(s.expensesByCategory).toEqual([
      { categoryId: 'mercado', amountMinor: 225_000_00n },
      { categoryId: 'hogar', amountMinor: 0n },
    ]);
  });

  it('converts each line at its own day’s rate, and lists what has no rate instead of using zero', () => {
    const converter = new Converter(book([['USD/COP', '4000', '2026-01-01']]), 'COP');
    const s = summarize(
      [
        fact('2025-12-31', 'income', 'income', 'USD', -100_00n, { categoryId: 'b' }),
        fact('2026-01-15', 'income', 'income', 'USD', -100_00n, { categoryId: 'b' }),
      ],
      converter,
    );
    expect(s.income).toBe(400_000_00n);
    expect(converter.complete).toBe(false);
    expect(converter.excluded).toEqual([
      { date: d('2025-12-31'), currency: 'USD', component: 'income:b', amountMinor: -100_00n },
    ]);
  });
});

describe('netWorth', () => {
  it('adds assets and (negative) liabilities at the day’s rate', () => {
    const balances: AccountBalance[] = [
      { accountId: 'bank', kind: 'asset', currency: 'COP', balanceMinor: 18_500_000_00n },
      { accountId: 'wise', kind: 'asset', currency: 'USD', balanceMinor: 2_150_00n },
      { accountId: 'loan', kind: 'liability', currency: 'COP', balanceMinor: -38_441_578_00n },
    ];
    const nw = netWorth(
      balances,
      d('2025-09-30'),
      new Converter(book([['USD/COP', '3980', '2025-09-01']]), 'COP'),
    );
    expect(nw.assets).toBe(18_500_000_00n + 8_557_000_00n);
    expect(nw.liabilities).toBe(-38_441_578_00n);
    expect(nw.total).toBe(18_500_000_00n + 8_557_000_00n - 38_441_578_00n);
  });
});

describe('bridge', () => {
  /** A random but valid ledger: balanced transactions over COP and USD accounts. */
  const ACCOUNTS: {
    id: string;
    kind: LedgerFact['accountKind'];
    currency: CurrencyCode;
    role?: LedgerFact['systemRole'];
  }[] = [
    { id: 'bank', kind: 'asset', currency: 'COP' },
    { id: 'wise', kind: 'asset', currency: 'USD' },
    { id: 'visa', kind: 'liability', currency: 'COP' },
  ];
  const sys = (
    role: NonNullable<LedgerFact['systemRole']>,
    kind: LedgerFact['accountKind'],
    currency: CurrencyCode,
  ) => ({
    accountId: `${role}-${currency}`,
    accountKind: kind,
    currency,
    systemRole: role,
  });

  const amount = fc.bigInt({ min: 1n, max: 5_000_000_00n });
  const dayOf = fc.integer({ min: 0, max: 89 }).map((n) => {
    const t = new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);
    return d(t.toISOString().slice(0, 10));
  });
  const action = fc.oneof(
    fc.record({
      type: fc.constant('expense' as const),
      account: fc.constantFrom(0, 1, 2),
      amount,
      on: dayOf,
    }),
    fc.record({
      type: fc.constant('income' as const),
      account: fc.constantFrom(0, 1),
      amount,
      on: dayOf,
    }),
    fc.record({ type: fc.constant('fx' as const), usd: amount, cop: amount, on: dayOf }),
    fc.record({ type: fc.constant('valuation' as const), amount, on: dayOf }),
    fc.record({ type: fc.constant('opening' as const), amount, on: dayOf }),
  );
  const rate = fc.tuple(fc.integer({ min: 3500, max: 4500 }), fc.integer({ min: 0, max: 99 }));

  it('always explains the change in net worth exactly, to the minor unit', () => {
    fc.assert(
      fc.property(
        fc.array(action, { maxLength: 40 }),
        fc.array(rate, { minLength: 3, maxLength: 3 }),
        (actions, rates) => {
          const facts: LedgerFact[] = [];
          const add = (on: LocalDate, entries: Omit<LedgerFact, 'occurredOn' | 'categoryId'>[]) =>
            facts.push(
              ...entries.map((e) => ({
                ...e,
                occurredOn: on,
                categoryId: e.accountKind === 'income' || e.accountKind === 'expense' ? 'c' : null,
              })),
            );
          for (const a of actions) {
            if (a.type === 'expense' || a.type === 'income') {
              const acc = ACCOUNTS[a.account] ?? ACCOUNTS[0];
              if (!acc) continue;
              const sign = a.type === 'expense' ? -1n : 1n;
              add(a.on, [
                {
                  accountId: acc.id,
                  accountKind: acc.kind,
                  currency: acc.currency,
                  systemRole: null,
                  amountMinor: sign * a.amount,
                },
                { ...sys(a.type, a.type, acc.currency), amountMinor: -sign * a.amount },
              ]);
            } else if (a.type === 'fx') {
              add(a.on, [
                {
                  accountId: 'wise',
                  accountKind: 'asset',
                  currency: 'USD',
                  systemRole: null,
                  amountMinor: -a.usd,
                },
                { ...sys('fx', 'clearing', 'USD'), amountMinor: a.usd },
                { ...sys('fx', 'clearing', 'COP'), amountMinor: -a.cop },
                {
                  accountId: 'bank',
                  accountKind: 'asset',
                  currency: 'COP',
                  systemRole: null,
                  amountMinor: a.cop,
                },
              ]);
            } else {
              const role =
                a.type === 'valuation' ? ('valuation' as const) : ('opening_balance' as const);
              add(a.on, [
                {
                  accountId: 'wise',
                  accountKind: 'asset',
                  currency: 'USD',
                  systemRole: null,
                  amountMinor: a.amount,
                },
                { ...sys(role, 'equity', 'USD'), amountMinor: -a.amount },
              ]);
            }
          }
          const rateBook = book(
            rates.map(([whole, cents], i): [string, string, string] => [
              'USD/COP',
              `${whole}.${cents.toString().padStart(2, '0')}`,
              ['2025-12-01', '2026-02-01', '2026-03-01'][i] ?? '2025-12-01',
            ]),
          );
          const from = d('2026-01-20');
          const to = d('2026-03-20');
          const startDate = d('2026-01-19');
          const balancesAt = (on: LocalDate): AccountBalance[] =>
            ACCOUNTS.map((a) => ({
              accountId: a.id,
              kind: a.kind as 'asset' | 'liability',
              currency: a.currency,
              balanceMinor: facts
                .filter((f) => f.accountId === a.id && f.occurredOn <= on)
                .reduce((s, f) => s + f.amountMinor, 0n),
            }));
          const b = bridge({
            facts: facts.filter((f) => f.occurredOn >= from && f.occurredOn <= to),
            startBalances: balancesAt(startDate),
            endBalances: balancesAt(to),
            startDate,
            endDate: to,
            converter: new Converter(rateBook, 'COP'),
          });
          expect(b.end - b.start).toBe(
            b.net +
              b.valuation +
              b.openingContributions +
              b.realizedFx +
              b.unrealizedFx +
              b.rounding,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('a COP-only ledger has no FX or rounding lines', () => {
    const facts = [
      fact('2026-02-01', 'bank', 'asset', 'COP', 10_000_00n),
      fact('2026-02-01', 'income-COP', 'income', 'COP', -10_000_00n, { categoryId: 'c' }),
    ];
    const b = bridge({
      facts,
      startBalances: [{ accountId: 'bank', kind: 'asset', currency: 'COP', balanceMinor: 0n }],
      endBalances: [
        { accountId: 'bank', kind: 'asset', currency: 'COP', balanceMinor: 10_000_00n },
      ],
      startDate: d('2026-01-31'),
      endDate: d('2026-02-28'),
      converter: new Converter(book([]), 'COP'),
    });
    expect(b).toMatchObject({
      net: 10_000_00n,
      realizedFx: 0n,
      unrealizedFx: 0n,
      rounding: 0n,
      end: 10_000_00n,
    });
  });
});
