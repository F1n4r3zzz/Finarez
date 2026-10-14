import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../app/routes';

export interface Call {
  method: string;
  path: string;
  body: unknown;
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

export const signedIn = {
  'GET /auth/get-session': () => json({ session: {}, user: USER }),
  'GET /me/preferences': () => json(PREFERENCES),
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
    calls.push({ method, path, body });
    const handler = handlers[`${method} ${path}`];
    if (!handler) throw new Error(`Unexpected API call: ${method} ${path}`);
    return handler(body);
  });
  return {
    calls,
    /** Calls other than the session and preferences checks every page load makes. */
    actions: () =>
      calls.filter(
        (c) => !(c.method === 'GET' && ['/auth/get-session', '/me/preferences'].includes(c.path)),
      ),
  };
}

/** Renders the app at `path` and returns the router, to inspect where it ended up. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
