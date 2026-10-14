import { describe, expect, it } from 'vitest';
import { healthRoutes } from './health';

describe('GET /health', () => {
  it('reports ok when the database answers', async () => {
    const res = await healthRoutes(async () => {}).request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('reports 503 without leaking the error when the database is down', async () => {
    const res = await healthRoutes(async () => {
      throw new Error('password authentication failed for user "finanz"');
    }).request('/');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'unavailable' });
  });
});
