import { randomInt } from 'node:crypto';
import { CONSENTS } from '@finanz/contracts';
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { emailSends } from '../../platform/email/schema';
import {
  createTestContext,
  signedInUser,
  TEST_PASSWORD,
  TestClient,
  uniqueEmail,
} from '../../test/context';

const normal = createTestContext();
const exhausted = createTestContext({ emailLimit: 0 });
const outage = createTestContext({
  deliver: {
    send: async () => {
      throw new Error('provider down');
    },
  },
});
afterAll(async () => {
  await Promise.all([normal.close(), exhausted.close(), outage.close()]);
});

const signUpBody = (email: string) => ({
  name: 'Ana',
  email,
  password: TEST_PASSWORD,
  callbackURL: '/',
  consents: CONSENTS,
});

/** Status and body, to compare answers for different addresses. */
async function answer(res: Response) {
  return { status: res.status, body: await res.text() };
}

describe('when the daily email budget is exhausted', () => {
  it('refuses sign-up with 503 before creating the account', async () => {
    const email = uniqueEmail();
    const res = await new TestClient(exhausted.app).request(
      'POST',
      '/api/auth/sign-up/email',
      signUpBody(email),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'EMAIL_UNAVAILABLE' });
    const users = await normal.db.execute(sql`select 1 from identity.users where email = ${email}`);
    expect(users.rows).toHaveLength(0);
  });

  it('answers "resend verification" identically for unknown, unverified and verified addresses', async () => {
    const unverified = uniqueEmail();
    await new TestClient(normal.app).request(
      'POST',
      '/api/auth/sign-up/email',
      signUpBody(unverified),
    );
    const { email: verified } = await signedInUser(normal);

    const ask = async (email: string) =>
      answer(
        await new TestClient(exhausted.app).request('POST', '/api/auth/send-verification-email', {
          email,
          callbackURL: '/',
        }),
      );
    const [a, b, c] = [await ask(uniqueEmail()), await ask(unverified), await ask(verified)];
    expect(a.status).toBe(503);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('answers password-reset requests identically for unknown and existing addresses', async () => {
    const { email: existing } = await signedInUser(normal);
    const ask = async (email: string) =>
      answer(
        await new TestClient(exhausted.app).request('POST', '/api/auth/request-password-reset', {
          email,
          redirectTo: '/',
        }),
      );
    const unknown = await ask(uniqueEmail());
    expect(unknown.status).toBe(503);
    expect(await ask(existing)).toEqual(unknown);
  });
});

describe('email budget and rate limits', () => {
  it('only requests that pass the rate limit use the budget, so a flood cannot drain it', async () => {
    const day = new Date(Date.UTC(2200, 0, 1) + randomInt(0, 300_000) * 86_400_000);
    const ctx = createTestContext({ emailDay: () => day });
    try {
      const client = new TestClient(ctx.app);
      const statuses: number[] = [];
      for (let n = 0; n < 6; n++) {
        const res = await client.request('POST', '/api/auth/request-password-reset', {
          email: uniqueEmail(),
          redirectTo: '/',
        });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([200, 200, 200, 429, 429, 429]);
      const [row] = await ctx.db
        .select({ count: emailSends.count })
        .from(emailSends)
        .where(eq(emailSends.day, day.toISOString().slice(0, 10)));
      expect(row?.count).toBe(3);
    } finally {
      await ctx.close();
    }
  });
});

describe('when the email provider fails', () => {
  it('keeps the normal answer, and the new account can ask for the email again later', async () => {
    const email = uniqueEmail();
    const res = await new TestClient(outage.app).request(
      'POST',
      '/api/auth/sign-up/email',
      signUpBody(email),
    );
    expect(res.status).toBe(200);
    expect(normal.emails.to(email)).toHaveLength(0);

    // Provider is back: resending works for the account created during the outage.
    const client = new TestClient(normal.app);
    const resend = await client.request('POST', '/api/auth/send-verification-email', {
      email,
      callbackURL: '/',
    });
    expect(resend.status).toBe(200);
    expect((await client.open(normal.emails.lastLink(email))).status).toBe(302);
    const signIn = await client.request('POST', '/api/auth/sign-in/email', {
      email,
      password: TEST_PASSWORD,
    });
    expect(signIn.status).toBe(200);
  });
});
