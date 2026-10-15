import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../app/routes';

export interface Call {
  method: string;
  path: string;
  body: unknown;
  /** Request headers other than Content-Type, e.g. Idempotency-Key. */
  headers?: Record<string, string>;
}

/** Keys are "METHOD /path" under /api, e.g. "GET /auth/get-session". */
export type Handlers = Record<string, (body: unknown) => Response>;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export const USER = { id: 'u1', email: 'ana@example.com' };
export const PREFERENCES = { language: 'es', timeZone: 'America/Bogota', primaryCurrency: 'COP' };

export const signedOut = {
  'GET /auth/get-session': () => json(null),
  'GET /me/preferences': () =>
    json({ error: { code: 'auth.required', message: 'Sign in required' } }, 401),
} satisfies Handlers;

const nothingYet = { currency: 'COP', complete: true, excluded: [], rateIds: [], staleRateIds: [] };

export const signedIn = {
  'GET /auth/get-session': () => json({ session: {}, user: USER }),
  'GET /me/preferences': () => json(PREFERENCES),
  // A new user: no accounts or movements yet.
  'GET /ledger/accounts': () => json([]),
  'GET /ledger/transactions': () => json([]),
  'GET /categories': () => json([]),
  'GET /currency/rates': () => json([]),
  'GET /debts': () => json([]),
  'GET /reports/net-worth': () =>
    json({
      on: '2026-10-14',
      totalMinor: '0',
      assetsMinor: '0',
      liabilitiesMinor: '0',
      byAccount: [],
      ...nothingYet,
    }),
  'GET /reports/summary': () =>
    json({
      from: '2026-10-01',
      to: '2026-10-31',
      incomeMinor: '0',
      expensesMinor: '0',
      netMinor: '0',
      incomeByCategory: [],
      expensesByCategory: [],
      ...nothingYet,
    }),
} satisfies Handlers;

/**
 * Replaces fetch with canned answers for the API and records every call. An unexpected
 * call fails the test with its method and path.
 */
export function fakeApi(handlers: Handlers) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(input, 'http://localhost').pathname.replace(/^\/api/, '');
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).filter(
        ([name]) => name.toLowerCase() !== 'content-type',
      ),
    );
    const search = new URL(input, 'http://localhost').search;
    calls.push({
      method,
      path: path + search,
      body,
      ...(Object.keys(headers).length ? { headers } : {}),
    });
    const handler = handlers[`${method} ${path}`];
    if (!handler) throw new Error(`Unexpected API call: ${method} ${path}${search}`);
    return handler(body);
  });
  return {
    calls,
    /** Calls that change something (every GET left out). */
    actions: () => calls.filter((c) => c.method !== 'GET'),
  };
}

/** Renders the app at `path` and returns the router, to inspect where it ended up. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
