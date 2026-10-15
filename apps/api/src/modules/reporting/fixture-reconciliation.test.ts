import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type {
  AccountView,
  BridgeReport,
  Category,
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
      // The fixture predates the version 2 categories, where both bill groups became one.
      const renamed: Record<string, string> = {
        'Servicios públicos': 'Servicios del hogar',
        'Internet y celular': 'Servicios del hogar',
      };
      const categoryId = (kind: string, name: string) => {
        const id = categories.get(`${kind}:${renamed[name] ?? name}`);
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

      for (const d of fixture.drafts) {
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
