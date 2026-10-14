import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, TestClient, uniqueEmail } from '../../test/context';

const ctx = createTestContext();
afterAll(() => ctx.close());

const PASSWORD = 'correct horse battery';
const PREFS = { language: 'es', timeZone: 'America/Bogota', primaryCurrency: 'COP' };

async function signUp(client: TestClient, email: string, password = PASSWORD) {
  return client.request('POST', '/api/auth/sign-up/email', {
    name: 'Ana',
    email,
    password,
    callbackURL: '/',
  });
}

/** Registers and verifies an account; the client ends up signed in. */
async function verifiedUser() {
  const client = new TestClient(ctx.app);
  const email = uniqueEmail();
  expect((await signUp(client, email)).status).toBe(200);
  expect((await client.open(ctx.emails.lastLink(email))).status).toBe(302);
  return { client, email };
}

describe('registration and email verification', () => {
  it('emails a verification link and blocks sign-in until it is opened', async () => {
    const client = new TestClient(ctx.app);
    const email = uniqueEmail();

    expect((await signUp(client, email)).status).toBe(200);
    const [message] = ctx.emails.to(email);
    expect(message?.subject).toBe('Confirma tu correo en Finanz');
    expect(ctx.emails.lastLink(email).pathname).toBe('/api/auth/verify-email');

    const early = await client.request('POST', '/api/auth/sign-in/email', {
      email,
      password: PASSWORD,
    });
    expect(early.status).toBe(403);

    const verified = await client.open(ctx.emails.lastLink(email));
    expect(verified.status).toBe(302);
    // Verifying signs the user in.
    expect((await client.request('GET', '/api/me/preferences')).status).toBe(404);
  });

  it('rejects passwords shorter than 10 characters', async () => {
    const res = await signUp(new TestClient(ctx.app), uniqueEmail(), 'short1234');
    expect(res.status).toBe(400);
  });

  it('answers a sign-up for an existing email like any other, and changes nothing (no account discovery)', async () => {
    const { email } = await verifiedUser();
    const emailsBefore = ctx.emails.to(email).length;

    const again = await new TestClient(ctx.app).request('POST', '/api/auth/sign-up/email', {
      name: 'Intruso',
      email,
      password: 'intruder password 123',
      callbackURL: '/',
    });
    expect(again.status).toBe(200);

    const users = await ctx.db.execute<{ name: string }>(
      sql`select name from identity.users where email = ${email}`,
    );
    expect(users.rows).toEqual([{ name: 'Ana' }]);
    expect(ctx.emails.to(email)).toHaveLength(emailsBefore);
    const probe = new TestClient(ctx.app);
    const intruder = await probe.request('POST', '/api/auth/sign-in/email', {
      email,
      password: 'intruder password 123',
    });
    expect(intruder.status).toBe(401);
    const owner = await probe.request('POST', '/api/auth/sign-in/email', {
      email,
      password: PASSWORD,
    });
    expect(owner.status).toBe(200);
  });
});

describe('sessions', () => {
  it('signs out and back in', async () => {
    const { client, email } = await verifiedUser();
    expect((await client.request('POST', '/api/auth/sign-out', {})).status).toBe(200);
    expect((await client.request('GET', '/api/me/preferences')).status).toBe(401);

    const wrong = await client.request('POST', '/api/auth/sign-in/email', {
      email,
      password: 'wrong password!',
    });
    expect(wrong.status).toBe(401);
    const signIn = await client.request('POST', '/api/auth/sign-in/email', {
      email,
      password: PASSWORD,
    });
    expect(signIn.status).toBe(200);
    expect((await client.request('GET', '/api/me/preferences')).status).toBe(404);
  });

  it('refuses requests without a session', async () => {
    const res = await new TestClient(ctx.app).request('GET', '/api/me/preferences');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'auth.required', message: 'Sign in required' },
    });
  });
});

describe('preferences', () => {
  it('saves and returns the language, time zone and primary currency', async () => {
    const { client } = await verifiedUser();
    const missing = await client.request('GET', '/api/me/preferences');
    expect(await missing.json()).toMatchObject({ error: { code: 'preferences.not_set' } });

    expect((await client.request('PUT', '/api/me/preferences', PREFS)).status).toBe(200);
    expect(await (await client.request('GET', '/api/me/preferences')).json()).toEqual(PREFS);

    const changed = { ...PREFS, timeZone: 'America/Mexico_City', primaryCurrency: 'MXN' };
    await client.request('PUT', '/api/me/preferences', changed);
    expect(await (await client.request('GET', '/api/me/preferences')).json()).toEqual(changed);
  });

  it('reports every invalid field', async () => {
    const { client } = await verifiedUser();
    const res = await client.request('PUT', '/api/me/preferences', {
      language: 'fr',
      timeZone: 'Mars/Olympus',
      primaryCurrency: 'BTC',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; issues: { path: string }[] } };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.issues.map((i) => i.path).sort()).toEqual([
      'language',
      'primaryCurrency',
      'timeZone',
    ]);
  });

  it('keeps each user’s preferences separate', async () => {
    const a = await verifiedUser();
    const b = await verifiedUser();
    await a.client.request('PUT', '/api/me/preferences', PREFS);
    expect((await b.client.request('GET', '/api/me/preferences')).status).toBe(404);
  });
});

describe('password reset', () => {
  it('resets through the emailed link and signs out every old session', async () => {
    const { client, email } = await verifiedUser();
    const resetter = new TestClient(ctx.app);
    const requested = await resetter.request('POST', '/api/auth/request-password-reset', {
      email,
      redirectTo: '/restablecer',
    });
    expect(requested.status).toBe(200);
    expect(ctx.emails.to(email).at(-1)?.subject).toBe('Elige una contraseña nueva para Finanz');

    const token = ctx.emails.lastLink(email).pathname.split('/').at(-1);
    const NEW_PASSWORD = 'a brand new passphrase';
    const reset = await resetter.request('POST', '/api/auth/reset-password', {
      newPassword: NEW_PASSWORD,
      token,
    });
    expect(reset.status).toBe(200);

    expect((await client.request('GET', '/api/me/preferences')).status).toBe(401);
    const oldPassword = await resetter.request('POST', '/api/auth/sign-in/email', {
      email,
      password: PASSWORD,
    });
    expect(oldPassword.status).toBe(401);
    const newPassword = await resetter.request('POST', '/api/auth/sign-in/email', {
      email,
      password: NEW_PASSWORD,
    });
    expect(newPassword.status).toBe(200);
  });

  it('answers the same for unknown emails and sends nothing (no account discovery)', async () => {
    const email = uniqueEmail();
    const res = await new TestClient(ctx.app).request('POST', '/api/auth/request-password-reset', {
      email,
      redirectTo: '/restablecer',
    });
    expect(res.status).toBe(200);
    expect(ctx.emails.to(email)).toHaveLength(0);
  });
});
