import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type {
  AccountView,
  BridgeReport,
  BudgetView,
  Category,
  GoalView,
  NetWorthReport,
  SummaryReport,
} from '@finanz/contracts';
import { type CurrencyCode, parseLocalDate } from '@finanz/kernel';
import { afterAll, describe, expect, it } from 'vitest';
import { inUnitOfWork } from '../../db/unit-of-work';
import { createTestContext, signedInUser, type TestClient } from '../../test/context';
import { postTransaction } from '../ledger';

/**
 * End-to-end reconciliation against a full synthetic year (a freelancer with COP, USD and MXN
 * accounts). The data and its expected figures are produced by a separate tool and passed in
 * through FINANZ_FIXTURE_JSON; without it, this suite is skipped.
 */
const file = process.env.FINANZ_FIXTURE_JSON;

interface Fixture {
  accounts: {
    name: string;
    subtype: string;
    currency: CurrencyCode;
    openedOn: string;
    openingBalanceMinor: string;
  }[];
  rates: { base: string; quote: string; validFrom: string; rate: string }[];
  /** Savings goals; their contributions are the drafts described "Aporte — <name>". */
  goals?: {
    name: string;
    currency: string;
    targetMinor: string;
    targetDate: string;
    account: string;
  }[];
  /** Spending limits per category; the workbook budgets each bill group on its own. */
  budgets?: {
    category: string;
    period: 'monthly' | 'quarterly' | 'yearly';
    currency: string;
    amountMinor: string;
    startsOn: string;
  }[];
  drafts: (
    | {
        kind: 'expense' | 'income';
        occurredOn: string;
        description: string;
        account: string;
        lines: { category: string; amountMinor: string }[];
      }
    | {
        kind: 'transfer';
        occurredOn: string;
        description: string;
        from: { account: string; amountMinor: string };
        to: { account: string; amountMinor: string };
      }
    | {
        kind: 'valuation';
        occurredOn: string;
        description: string;
        account: string;
        amountMinor: string;
      }
  )[];
  controls: {
    months: Record<string, { income: string; expenses: string; net: string }>;
    closingBalances: Record<string, string>;
    netWorth: Record<string, string>;
    bridge: Record<string, string>;
    /** Contributed per goal, as the workbook states it. */
    goals?: Record<string, string>;
    /** Spent per month and budgeted category; overspent means strictly above the limit. */
    budgets?: Record<string, Record<string, string>>;
  };
}

describe.skipIf(!file)(
  'the freelancer year reconciles with independently computed controls',
  () => {
    const fixture = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : undefined;
    const ctx = createTestContext();
    afterAll(() => ctx.close());

    async function json<T>(client: TestClient, method: string, path: string, body?: unknown) {
      const res = await client.request(method, path, body, {
        headers: { 'Idempotency-Key': randomUUID() },
      });
      if (res.status >= 400)
        throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
      return (await res.json()) as T;
    }

    it('loads 12 months through the ledger and every figure matches to the cent', {
      timeout: 120_000,
    }, async () => {
      if (!fixture) return;
      const { client } = await signedInUser(ctx);
      const userId = (await json<{ user: { id: string } }>(client, 'GET', '/api/auth/get-session'))
        .user.id;
      await json(client, 'PUT', '/api/me/preferences', {
        language: 'es',
        timeZone: 'America/Bogota',
        primaryCurrency: 'COP',
      });
      for (const r of fixture.rates) await json(client, 'POST', '/api/currency/rates', r);

      const categories = new Map(
        (await json<Category[]>(client, 'GET', '/api/categories')).map((c) => [
          `${c.kind}:${c.name}`,
          c.id,
        ]),
      );
      // The fixture predates the version 2 categories, where both bill groups live under
      // "Servicios del hogar"; the workbook budgets each group, so each becomes a subcategory.
      for (const name of ['Servicios públicos', 'Internet y celular']) {
        const sub = await json<Category>(client, 'POST', '/api/categories', {
          kind: 'expense',
          name,
          parentId: categories.get('expense:Servicios del hogar'),
        });
        categories.set(`expense:${name}`, sub.id);
      }
      const categoryId = (kind: string, name: string) => {
        const id = categories.get(`${kind}:${name}`);
        if (!id) throw new Error(`Missing category ${kind}:${name}`);
        return id;
      };
      const accounts = new Map<string, AccountView>();
      for (const a of fixture.accounts) {
        const view = await json<AccountView>(client, 'POST', '/api/ledger/accounts', a);
        accounts.set(a.name, view);
      }
      const account = (name: string) => {
        const found = accounts.get(name);
        if (!found) throw new Error(`Missing account ${name}`);
        return found;
      };

      // Contributions go through savings, which records the same transfer as its own.
      const goalIds = new Map<string, string>();
      for (const g of fixture.goals ?? []) {
        const { account: _account, ...body } = g;
        goalIds.set(g.name, (await json<GoalView>(client, 'POST', '/api/savings/goals', body)).id);
      }
      const contribution = (d: Fixture['drafts'][number]) =>
        d.kind === 'transfer' && d.description.startsWith('Aporte — ')
          ? goalIds.get(d.description.slice('Aporte — '.length))
          : undefined;

      for (const d of fixture.drafts) {
        const goalId = contribution(d);
        if (goalId && d.kind === 'transfer') {
          await json(client, 'POST', `/api/savings/goals/${goalId}/allocations`, {
            direction: 'contribute',
            accountId: account(d.to.account).id,
            fromAccountId: account(d.from.account).id,
            amountMinor: d.to.amountMinor,
            occurredOn: d.occurredOn,
          });
          continue;
        }
        const occurredOn = parseLocalDate(d.occurredOn);
        await inUnitOfWork(ctx.db, (tx) => {
          const actor = { userId };
          switch (d.kind) {
            case 'expense':
            case 'income': {
              const base = {
                occurredOn,
                description: d.description,
                accountId: account(d.account).id,
                lines: d.lines.map((l) => ({
                  categoryId: categoryId(d.kind, l.category),
                  amountMinor: BigInt(l.amountMinor),
                })),
              };
              return postTransaction(
                tx,
                actor,
                d.kind === 'expense' ? { ...base, kind: 'expense' } : { ...base, kind: 'income' },
              );
            }
            case 'transfer':
              return postTransaction(tx, actor, {
                kind: 'transfer',
                occurredOn,
                description: d.description,
                from: {
                  accountId: account(d.from.account).id,
                  amountMinor: BigInt(d.from.amountMinor),
                },
                to: { accountId: account(d.to.account).id, amountMinor: BigInt(d.to.amountMinor) },
              });
            case 'valuation': {
              const target = account(d.account);
              const amount = BigInt(d.amountMinor);
              return postTransaction(
                tx,
                { userId, module: 'investments' },
                {
                  kind: 'valuation',
                  occurredOn,
                  description: d.description,
                  payee: null,
                  notes: null,
                  entries: [
                    {
                      account: { accountId: target.id },
                      accountKind: 'asset',
                      currency: target.currency,
                      amountMinor: amount,
                      categoryId: null,
                      memo: null,
                    },
                    {
                      account: { systemRole: 'valuation', currency: target.currency },
                      accountKind: 'equity',
                      currency: target.currency,
                      amountMinor: -amount,
                      categoryId: null,
                      memo: null,
                    },
                  ],
                },
                { managedBy: 'investments' },
              );
            }
          }
        });
      }

      const c = fixture.controls;
      for (const [month, expected] of Object.entries(c.months)) {
        const [y, m] = month.split('-').map(Number) as [number, number];
        const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        const s = await json<SummaryReport>(
          client,
          'GET',
          `/api/reports/summary?from=${month}-01&to=${last}`,
        );
        expect({
          month,
          income: s.incomeMinor,
          expenses: s.expensesMinor,
          net: s.netMinor,
          complete: s.complete,
        }).toEqual({
          month,
          ...expected,
          complete: true,
        });
      }

      const balances = Object.fromEntries(
        (await json<AccountView[]>(client, 'GET', '/api/ledger/accounts')).map((a) => [
          a.name,
          a.balanceMinor,
        ]),
      );
      expect(balances).toEqual(c.closingBalances);

      for (const [on, total] of Object.entries(c.netWorth)) {
        const nw = await json<NetWorthReport>(client, 'GET', `/api/reports/net-worth?on=${on}`);
        expect({ on, total: nw.totalMinor }).toEqual({ on, total });
      }

      if (c.goals) {
        const saved = Object.fromEntries(
          (await json<GoalView[]>(client, 'GET', '/api/savings/goals')).map((g) => [
            g.name,
            g.savedMinor,
          ]),
        );
        expect(saved).toEqual(c.goals);
      }

      if (fixture.budgets && c.budgets) {
        const budgetIds = new Map<string, string>();
        for (const { category, ...body } of fixture.budgets) {
          const view = await json<BudgetView>(client, 'POST', '/api/budgets', {
            ...body,
            categoryId: categoryId('expense', category),
          });
          budgetIds.set(view.id, category);
        }
        for (const [month, expected] of Object.entries(c.budgets)) {
          const views = await json<BudgetView[]>(client, 'GET', `/api/budgets?on=${month}-01`);
          const limits = new Map(fixture.budgets.map((x) => [x.category, BigInt(x.amountMinor)]));
          const actual = Object.fromEntries(
            views.map((v) => [budgetIds.get(v.id), [v.current?.spentMinor, v.current?.overspent]]),
          );
          expect({ month, actual }).toEqual({
            month,
            actual: Object.fromEntries(
              Object.entries(expected).map(([category, spent]) => [
                category,
                [spent, BigInt(spent) > (limits.get(category) ?? 0n)],
              ]),
            ),
          });
          expect(views.every((v) => v.current?.excluded.length === 0)).toBe(true);
        }
      }

      const b = await json<BridgeReport>(
        client,
        'GET',
        `/api/reports/bridge?from=${c.bridge.from}&to=${c.bridge.to}`,
      );
      expect({
        start: b.startMinor,
        end: b.endMinor,
        net: b.netMinor,
        valuation: b.valuationMinor,
        openingContributions: b.openingContributionsMinor,
        realizedFx: b.realizedFxMinor,
        unrealizedFx: b.unrealizedFxMinor,
        rounding: b.roundingMinor,
      }).toEqual({
        start: c.bridge.start,
        end: c.bridge.end,
        net: c.bridge.net,
        valuation: c.bridge.valuation,
        openingContributions: c.bridge.openingContributions,
        realizedFx: c.bridge.realizedFx,
        unrealizedFx: c.bridge.unrealizedFx,
        rounding: c.bridge.rounding,
      });
    });
  },
);
