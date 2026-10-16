import { describe, expect, it, vi } from 'vitest';
import { ApiFailure, api } from './api';

function answer(body: string, status: number, headers: Record<string, string> = {}) {
  vi.stubGlobal('fetch', async () => new Response(body, { status, headers }));
}

async function failure(): Promise<ApiFailure> {
  try {
    await api('POST', '/x', {});
  } catch (error) {
    if (error instanceof ApiFailure) return error;
  }
  throw new Error('expected an ApiFailure');
}

describe('api', () => {
  it('sends JSON to the same-origin API and returns the parsed answer', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    expect(await api('PUT', '/me/preferences', { a: 1 })).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('/api/me/preferences', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
  });

  it('reads the error code from Finarez errors and from auth errors', async () => {
    answer('{"error":{"code":"preferences.not_set","message":"x"}}', 404);
    expect(await failure()).toMatchObject({ status: 404, code: 'preferences.not_set' });
    answer('{"code":"EMAIL_NOT_VERIFIED","message":"x"}', 403);
    expect(await failure()).toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });
  });

  it('keeps the wait from rate-limit answers', async () => {
    answer('{"message":"Too many requests"}', 429, { 'X-Retry-After': '90' });
    expect(await failure()).toMatchObject({ status: 429, retryAfter: 90 });
  });

  it('survives error bodies that are not JSON', async () => {
    answer('<html>Bad gateway</html>', 502);
    expect(await failure()).toMatchObject({ status: 502, code: undefined });
  });

  it('reports an unreachable API as status 0', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await failure()).toMatchObject({ status: 0, code: 'network' });
  });
});
