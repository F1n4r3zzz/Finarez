import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    const app = createApp({ checkDatabase: async () => {} });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('reports 503 without leaking the error when the database is down', async () => {
    const app = createApp({
      checkDatabase: async () => {
        throw new Error('password authentication failed for user "finanz"');
      },
    });
    const res = await app.request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'unavailable' });
  });
});
