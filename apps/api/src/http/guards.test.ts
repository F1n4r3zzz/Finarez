import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, signedInUser, TestClient, uniqueEmail } from '../test/context';

const ctx = createTestContext();
afterAll(() => ctx.close());

const PREFS = { language: 'es', timeZone: 'America/Bogota', primaryCurrency: 'COP' };

describe('cross-site request protection', () => {
  it('refuses changes sent from another origin, and nothing changes', async () => {
    const { client } = await signedInUser(ctx);
    await client.request('PUT', '/api/me/preferences', PREFS);

    const forged = await client.request(
      'PUT',
      '/api/me/preferences',
      { ...PREFS, primaryCurrency: 'USD' },
      { origin: 'https://evil.example' },
    );
    expect(forged.status).toBe(403);
    expect(await forged.json()).toMatchObject({ error: { code: 'request.cross_origin' } });
    expect(await (await client.request('GET', '/api/me/preferences')).json()).toEqual(PREFS);
  });

  it('refuses changes with no Origin at all, including sign-in', async () => {
    const res = await new TestClient(ctx.app).request(
      'POST',
      '/api/auth/sign-in/email',
      { email: uniqueEmail(), password: 'whatever password' },
      { origin: null },
    );
    expect(res.status).toBe(403);
  });

  it('still allows reads from anywhere (responses are not readable cross-site without CORS)', async () => {
    const res = await new TestClient(ctx.app).request('GET', '/api/health', undefined, {
      origin: 'https://evil.example',
    });
    expect(res.status).toBe(200);
  });
});

describe('JSON-only request bodies', () => {
  it.each([
    ['form post', 'application/x-www-form-urlencoded', 'language=es'],
    ['plain text', 'text/plain', '{"language":"es"}'],
    ['multipart', 'multipart/form-data; boundary=x', '--x--'],
  ])('rejects a %s body with 415', async (_, contentType, rawBody) => {
    const { client } = await signedInUser(ctx);
    const res = await client.request('PUT', '/api/me/preferences', undefined, {
      contentType,
      rawBody,
    });
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ error: { code: 'request.unsupported_media_type' } });
  });

  it('accepts bodiless changes such as sign-out', async () => {
    const { client } = await signedInUser(ctx);
    expect((await client.request('POST', '/api/auth/sign-out')).status).toBe(200);
  });

  it('answers malformed JSON with 400, not a server error', async () => {
    const { client } = await signedInUser(ctx);
    const res = await client.request('PUT', '/api/me/preferences', undefined, {
      rawBody: '{"language":',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_json' } });
  });
});

describe('response headers', () => {
  it('sets security headers and keeps signed-in responses out of caches', async () => {
    const { client } = await signedInUser(ctx);
    const res = await client.request('GET', '/api/me/preferences');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBeTruthy();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('auth responses', () => {
  it('are never cached: sessions, session lists and redirects', async () => {
    const { client } = await signedInUser(ctx);
    for (const path of ['/api/auth/get-session', '/api/auth/list-sessions']) {
      const res = await client.request('GET', path);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    const email = uniqueEmail();
    const newcomer = new TestClient(ctx.app);
    await newcomer.request('POST', '/api/auth/sign-up/email', {
      name: 'Ana',
      email,
      password: 'correct horse battery',
      callbackURL: '/',
    });
    const redirect = await newcomer.open(ctx.emails.lastLink(email));
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('cache-control')).toBe('no-store');
  });
});

describe('unknown API paths', () => {
  it('answer 404 in the usual error shape', async () => {
    const res = await new TestClient(ctx.app).request('GET', '/api/no-such-thing');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});
