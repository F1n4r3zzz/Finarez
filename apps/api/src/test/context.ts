import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../app';
import { createDatabase } from '../db/client';
import { createAuth } from '../modules/identity';
import { testDatabaseUrl } from './database';
import { CapturingEmailSender } from './email';

export const TEST_APP_URL = 'http://localhost:5173';

/** One API instance against the test database. Create two to simulate two servers. */
export function createTestContext() {
  const { db, pool } = createDatabase(testDatabaseUrl(), { max: 4 });
  const emails = new CapturingEmailSender();
  const auth = createAuth({
    db,
    config: { APP_URL: TEST_APP_URL, AUTH_SECRET: 'test-only-secret-not-used-anywhere-else' },
    email: emails,
  });
  return { app: createApp({ db, auth }), db, emails, close: () => pool.end() };
}

export type TestApp = ReturnType<typeof createTestContext>['app'];

export const uniqueEmail = () => `persona+${randomUUID()}@example.com`;

/** A random address in 100.64.0.0/10 so rate-limit keys never collide between tests. */
export const randomIp = () => {
  const [a = 0, b = 0, c = 0] = randomBytes(3);
  return `100.${64 + (a % 64)}.${b}.${c}`;
};

/** A browser-like client: same origin, one IP, and a cookie jar. */
export class TestClient {
  private readonly cookies = new Map<string, string>();

  constructor(
    private readonly app: TestApp,
    readonly ip: string = randomIp(),
  ) {}

  async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers = new Headers({ origin: TEST_APP_URL, 'x-forwarded-for': this.ip });
    if (body !== undefined) headers.set('content-type', 'application/json');
    if (this.cookies.size > 0) {
      headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    }
    const res = await this.app.request(`${TEST_APP_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1);
      if (value === '' || /max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  /** Follow a link from an email (same origin), keeping cookies. */
  open(link: URL): Promise<Response> {
    return this.request('GET', `${link.pathname}${link.search}`);
  }

  /** Use another client's session, e.g. a stolen or old cookie. */
  copyCookiesFrom(other: TestClient): void {
    for (const [k, v] of other.cookies) this.cookies.set(k, v);
  }
}
