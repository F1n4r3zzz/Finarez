import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, signedInUser } from '../../test/context';
import { findIsolationViolations } from '../../test/tenant-isolation';

const ctx = createTestContext();
afterAll(() => ctx.close());

const get = async (client: Awaited<ReturnType<typeof signedInUser>>['client']) =>
  (await client.request('GET', '/api/me/preferences')).json();

describe('identity: tenant isolation', () => {
  it("never shows another user's preferences", async () => {
    const owners = { language: 'es', timeZone: 'Pacific/Chatham', primaryCurrency: 'EUR' };
    const violations = await findIsolationViolations(ctx, async (owner) => {
      await owner.request('PUT', '/api/me/preferences', owners);
      return {
        secrets: ['Pacific/Chatham'],
        // "/me" resources have no ids: the intruder can only ever reach their own.
        probes: [{ kind: 'single', method: 'GET', path: '/api/me/preferences' }],
        ownerDataIntact: async () => JSON.stringify(await get(owner)) === JSON.stringify(owners),
      };
    });
    expect(violations).toEqual([]);
  });

  it("a user's writes only ever change their own preferences, even with a forged owner id", async () => {
    const owner = await signedInUser(ctx);
    const intruder = await signedInUser(ctx);
    const ownerPrefs = { language: 'es', timeZone: 'America/Bogota', primaryCurrency: 'COP' };
    await owner.client.request('PUT', '/api/me/preferences', ownerPrefs);
    const ownerSession = (await (
      await owner.client.request('GET', '/api/auth/get-session')
    ).json()) as {
      user: { id: string };
    };

    const intruderPrefs = { language: 'es', timeZone: 'Europe/Madrid', primaryCurrency: 'EUR' };
    const res = await intruder.client.request('PUT', '/api/me/preferences', {
      ...intruderPrefs,
      userId: ownerSession.user.id, // ignored: identity comes only from the session
    });
    expect(res.status).toBe(200);
    expect(await get(intruder.client)).toEqual(intruderPrefs);
    expect(await get(owner.client)).toEqual(ownerPrefs);
  });
});
