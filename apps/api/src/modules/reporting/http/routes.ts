import type { BridgeReport, MonthlyReport, NetWorthReport, SummaryReport } from '@finanz/contracts';
import {
  type CurrencyCode,
  type LocalDate,
  parseCurrencyCode,
  parseLocalDate,
  todayIn,
} from '@finanz/kernel';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Database, Executor } from '../../../db/client';
import { inSnapshot } from '../../../db/unit-of-work';
import { loadRateBook } from '../../currency';
import { type Auth, getPreferences, requireUser, type UserVariables } from '../../identity';
import { balancesAsOf, factsBetween } from '../../ledger';
import { bridge, Converter, netWorth, summarize, summarizeByMonth } from '../domain/figures';

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
    staleRateIds: [...converter.staleRateIds].sort(),
  };
}

/** Monthly series cover at most five years, which bounds the work per request. */
const MAX_MONTHS = 60;
const rangeTooLong = {
  error: { code: 'reports.range_too_long', message: `At most ${MAX_MONTHS} months` },
} as const;

const noPreferences = {
  error: { code: 'preferences.not_set', message: 'Choose a primary currency first' },
} as const;

/** The user's primary currency, time zone and every rate they can convert with. */
async function setup(tx: Executor, userId: string) {
  const preferences = await getPreferences(tx, userId);
  if (!preferences) return undefined;
  const currency = parseCurrencyCode(preferences.primaryCurrency);
  return {
    currency,
    timeZone: preferences.timeZone,
    converter: new Converter(await loadRateBook(tx, userId), currency),
  };
}

const minor = (v: bigint) => v.toString();

/**
 * Figures in the user's primary currency, mounted at /api/reports. Each response reads one
 * consistent snapshot of the ledger and the rates.
 */
export function reportRoutes({ auth, db }: { auth: Auth; db: Database }) {
  return new Hono<{ Variables: UserVariables }>()
    .use(requireUser(auth))
    .get('/summary', async (c) => {
      const q = range.parse(c.req.query());
      const [from, to] = [parseLocalDate(q.from), parseLocalDate(q.to)];
      const userId = c.var.userId;
      const body = await inSnapshot(db, async (tx): Promise<SummaryReport | undefined> => {
        const ctx = await setup(tx, userId);
        if (!ctx) return undefined;
        const s = summarize(await factsBetween(tx, userId, from, to), ctx.converter);
        const list = (items: { categoryId: string; amountMinor: bigint }[]) =>
          items.map((i) => ({ categoryId: i.categoryId, amountMinor: minor(i.amountMinor) }));
        return {
          from,
          to,
          incomeMinor: minor(s.income),
          expensesMinor: minor(s.expenses),
          netMinor: minor(s.net),
          incomeByCategory: list(s.incomeByCategory),
          expensesByCategory: list(s.expensesByCategory),
          ...completeness(ctx.converter, ctx.currency),
        };
      });
      return body ? c.json(body) : c.json(noPreferences, 409);
    })
    .get('/monthly', async (c) => {
      const q = range.parse(c.req.query());
      const [from, to] = [parseLocalDate(q.from), parseLocalDate(q.to)];
      const [fy, fm] = from.split('-').map(Number) as [number, number];
      const [ty, tm] = to.split('-').map(Number) as [number, number];
      if (from > to || (ty - fy) * 12 + (tm - fm) + 1 > MAX_MONTHS)
        return c.json(rangeTooLong, 400);
      const userId = c.var.userId;
      const body = await inSnapshot(db, async (tx): Promise<MonthlyReport | undefined> => {
        const ctx = await setup(tx, userId);
        if (!ctx) return undefined;
        const facts = await factsBetween(tx, userId, from, to);
        const months = summarizeByMonth(facts, ctx.converter, from, to).map((m) => ({
          month: m.month,
          from: m.from,
          to: m.to,
          incomeMinor: minor(m.income),
          expensesMinor: minor(m.expenses),
          netMinor: minor(m.net),
          expensesByCategory: m.expensesByCategory.map((i) => ({
            categoryId: i.categoryId,
            amountMinor: minor(i.amountMinor),
          })),
        }));
        return { from, to, months, ...completeness(ctx.converter, ctx.currency) };
      });
      return body ? c.json(body) : c.json(noPreferences, 409);
    })
    .get('/net-worth', async (c) => {
      const q = day.parse(c.req.query());
      const userId = c.var.userId;
      const body = await inSnapshot(db, async (tx): Promise<NetWorthReport | undefined> => {
        const ctx = await setup(tx, userId);
        if (!ctx) return undefined;
        const on = q.on ? parseLocalDate(q.on) : todayIn(ctx.timeZone);
        const nw = netWorth(await balancesAsOf(tx, userId, on), on, ctx.converter);
        return {
          on,
          totalMinor: minor(nw.total),
          assetsMinor: minor(nw.assets),
          liabilitiesMinor: minor(nw.liabilities),
          byAccount: nw.byAccount.map((a) => ({
            accountId: a.accountId,
            valueMinor: minor(a.valueMinor),
          })),
          ...completeness(ctx.converter, ctx.currency),
        };
      });
      return body ? c.json(body) : c.json(noPreferences, 409);
    })
    .get('/bridge', async (c) => {
      const q = range.parse(c.req.query());
      const [from, to] = [parseLocalDate(q.from), parseLocalDate(q.to)];
      const userId = c.var.userId;
      const body = await inSnapshot(db, async (tx): Promise<BridgeReport | undefined> => {
        const ctx = await setup(tx, userId);
        if (!ctx) return undefined;
        const startDate = previousDay(from);
        const b = bridge({
          facts: await factsBetween(tx, userId, from, to),
          startBalances: await balancesAsOf(tx, userId, startDate),
          endBalances: await balancesAsOf(tx, userId, to),
          startDate,
          endDate: to,
          converter: ctx.converter,
        });
        return {
          from,
          to,
          startMinor: minor(b.start),
          endMinor: minor(b.end),
          netMinor: minor(b.net),
          valuationMinor: minor(b.valuation),
          openingContributionsMinor: minor(b.openingContributions),
          realizedFxMinor: minor(b.realizedFx),
          unrealizedFxMinor: minor(b.unrealizedFx),
          roundingMinor: minor(b.rounding),
          ...completeness(ctx.converter, ctx.currency),
        };
      });
      return body ? c.json(body) : c.json(noPreferences, 409);
    });
}
