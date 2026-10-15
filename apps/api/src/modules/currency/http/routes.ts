import { rateInputSchema, rateRevisionSchema } from '@finanz/contracts';
import { minorUnits, parseCurrencyCode } from '@finanz/kernel';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Database } from '../../../db/client';
import { isUuid } from '../../../http/ids';
import { type Auth, requireUser, type UserVariables } from '../../identity';
import {
  addUserRate,
  listUserRates,
  RateAlreadyRevisedError,
  RateNotFoundError,
  reviseUserRate,
} from '../application/rates';
import { currencies } from '../infra/schema';

const notFound = { error: { code: 'not_found', message: 'Not found' } } as const;

/** Currencies and the user's own exchange rates, mounted at /api/currency. */
export function currencyRoutes({ auth, db }: { auth: Auth; db: Database }) {
  return new Hono<{ Variables: UserVariables }>()
    .use(requireUser(auth))
    .get('/currencies', async (c) => {
      const rows = await db
        .select({ code: currencies.code })
        .from(currencies)
        .where(eq(currencies.active, true))
        .orderBy(asc(currencies.code));
      return c.json(
        rows.map((r) => ({ code: r.code, minorUnits: minorUnits(parseCurrencyCode(r.code)) })),
      );
    })
    .get('/rates', async (c) => c.json(await listUserRates(db, c.var.userId)))
    .post('/rates', async (c) => {
      const input = rateInputSchema.parse(await c.req.json());
      return c.json(await addUserRate(db, c.var.userId, input), 201);
    })
    .post('/rates/:id/revisions', async (c) => {
      const input = rateRevisionSchema.parse(await c.req.json());
      if (!isUuid(c.req.param('id'))) return c.json(notFound, 404);
      try {
        return c.json(await reviseUserRate(db, c.var.userId, c.req.param('id'), input), 201);
      } catch (error) {
        if (error instanceof RateNotFoundError) return c.json(notFound, 404);
        if (error instanceof RateAlreadyRevisedError) {
          return c.json(
            { error: { code: 'rate.already_revised', message: 'Correct the newest revision' } },
            409,
          );
        }
        throw error;
      }
    });
}
