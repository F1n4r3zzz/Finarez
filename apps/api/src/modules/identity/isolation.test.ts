import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext } from '../../test/context';
import { findIsolationViolations } from '../../test/tenant-isolation';

const ctx = createTestContext();
afterAll(() => ctx.close());

describe('identity: tenant isolation', () => {
  it("never shows or changes another user's preferences", async () => {
    const owners = { language: 'es', timeZone: 'Pacific/Chatham', primaryCurrency: 'EUR' };
    const violations = await findIsolationViolations(ctx, async (owner) => {
      await owner.request('PUT', '/api/me/preferences', owners);
      return {
        secrets: ['Pacific/Chatham'],
        // "/me" resources have no ids: the intruder can only ever reach their own.
        probes: [{ kind: 'single', method: 'GET', path: '/api/me/preferences' }],
        ownerDataIntact: async () =>
          JSON.stringify(await (await owner.request('GET', '/api/me/preferences')).json()) ===
          JSON.stringify(owners),
      };
    });
    expect(violations).toEqual([]);
  });
});
