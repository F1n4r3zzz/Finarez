import type { BridgeReport, NetWorthReport, SummaryReport } from '@finanz/contracts';
import {
  type CurrencyCode,
  type LocalDate,
  parseCurrencyCode,
  parseLocalDate,
  todayIn,
} from '@finanz/kernel';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from '../../../db/client';
import { loadRateBook } from '../../currency';
import { type Auth, getPreferences, requireUser, type UserVariables } from '../../identity';
import { balancesAsOf, factsBetween } from '../../ledger';
import { bridge, Converter, netWorth, summarize } from '../domain/figures';

const range = z.object({ from: z.string(), to: z.string() });
const day = z.object({ on: z.string().optional() });

function previousDay(date: LocalDate): LocalDate {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return parseLocalDate(t.toISOString().slice(0, 10));
}

function completeness(converter: Converter, currency: CurrencyCode) {
  return {
    currency,
    complete: converter.complete,
    excluded: converter.excluded.map((e) => ({ ...e, amountMinor: e.amountMinor.toString() })),
    rateIds: [...converter.rateIds].sort(),
  };
}

/** Figures in the user's primary currency, mounted at /api/reports. */
export function reportRoutes({ auth, db }: { auth: Auth; db: Database }) {
  async function setup(userId: string) {
    const preferences = await getPreferences(db, userId);
    if (!preferences) return undefined;
    const currency = parseCurrencyCode(preferences.primaryCurrency);
    return {
      currency,
      timeZone: preferences.timeZone,
      converter: new Converter(await loadRateBook(db, userId), currency),
    };
  }
  const noPreferences = {
    error: { code: 'preferences.not_set', message: 'Choose a primary currency first' },
  };

  return new Hono<{ Variables: UserVariables }>()
    .use(requireUser(auth))
    .get('/summary', async (c) => {
      const q = range.parse(c.req.query());
      const [from, to] = [parseLocalDate(q.from), parseLocalDate(q.to)];
      const ctx = await setup(c.var.userId);
      if (!ctx) return c.json(noPreferences, 409);
      const s = summarize(await factsBetween(db, c.var.userId, from, to), ctx.converter);
      const list = (items: { categoryId: string; amountMinor: bigint }[]) =>
        items.map((i) => ({ categoryId: i.categoryId, amountMinor: i.amountMinor.toString() }));
      const body: SummaryReport = {
        from,
        to,
        incomeMinor: s.income.toString(),
        expensesMinor: s.expenses.toString(),
        netMinor: s.net.toString(),
        incomeByCategory: list(s.incomeByCategory),
        expensesByCategory: list(s.expensesByCategory),
        ...completeness(ctx.converter, ctx.currency),
      };
      return c.json(body);
    })
    .get('/net-worth', async (c) => {
      const q = day.parse(c.req.query());
      const ctx = await setup(c.var.userId);
      if (!ctx) return c.json(noPreferences, 409);
      const on = q.on ? parseLocalDate(q.on) : todayIn(ctx.timeZone);
      const nw = netWorth(await balancesAsOf(db, c.var.userId, on), on, ctx.converter);
      const body: NetWorthReport = {
        on,
        totalMinor: nw.total.toString(),
        assetsMinor: nw.assets.toString(),
        liabilitiesMinor: nw.liabilities.toString(),
        byAccount: nw.byAccount.map((a) => ({
          accountId: a.accountId,
          valueMinor: a.valueMinor.toString(),
        })),
        ...completeness(ctx.converter, ctx.currency),
      };
      return c.json(body);
    })
    .get('/bridge', async (c) => {
      const q = range.parse(c.req.query());
      const [from, to] = [parseLocalDate(q.from), parseLocalDate(q.to)];
      const ctx = await setup(c.var.userId);
      if (!ctx) return c.json(noPreferences, 409);
      const startDate = previousDay(from);
      const b = bridge({
        facts: await factsBetween(db, c.var.userId, from, to),
        startBalances: await balancesAsOf(db, c.var.userId, startDate),
        endBalances: await balancesAsOf(db, c.var.userId, to),
        startDate,
        endDate: to,
        converter: ctx.converter,
      });
      const body: BridgeReport = {
        from,
        to,
        startMinor: b.start.toString(),
        endMinor: b.end.toString(),
        netMinor: b.net.toString(),
        valuationMinor: b.valuation.toString(),
        openingContributionsMinor: b.openingContributions.toString(),
        realizedFxMinor: b.realizedFx.toString(),
        unrealizedFxMinor: b.unrealizedFx.toString(),
        roundingMinor: b.rounding.toString(),
        ...completeness(ctx.converter, ctx.currency),
      };
      return c.json(body);
    });
}
