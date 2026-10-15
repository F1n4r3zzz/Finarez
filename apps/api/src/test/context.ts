import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../app';
import { createDatabase } from '../db/client';
import { createAuth } from '../modules/identity';
import { BudgetedEmailSender, EmailBudget } from '../platform/email/budget';
import type { EmailSender } from '../platform/email/email';
import { testDatabaseUrl } from './database';
import { CapturingEmailSender } from './email';

export const TEST_APP_URL = 'http://localhost:5173';
export const TEST_PASSWORD = 'correct horse battery';

export interface TestContextOptions {
  /** Daily email cap for this instance (default: plenty). */
  emailLimit?: number;
  /** The day the email budget counts against (default: today). */
  emailDay?: () => Date;
  /** Replaces the delivery step, e.g. to simulate a provider outage. Emails are still captured. */
  deliver?: EmailSender;
}

/** One API instance against the test database. Create two to simulate two servers. */
export function createTestContext(options: TestContextOptions = {}) {
  const { db, pool } = createDatabase(testDatabaseUrl(), { max: 4 });
  const emails = new CapturingEmailSender();
  const emailBudget = new EmailBudget(db, options.emailLimit ?? 100_000, options.emailDay);
  const email = new BudgetedEmailSender(options.deliver ?? emails, emailBudget);
  const auth = createAuth({
    db,
    config: { APP_URL: TEST_APP_URL, AUTH_SECRET: 'test-only-secret-not-used-anywhere-else' },
    email,
    emailBudget,
  });
  return {
    app: createApp({ db, auth, appUrl: TEST_APP_URL }),
    auth,
    db,
    emails,
    close: () => pool.end(),
  };
}

export type TestApp = ReturnType<typeof createTestContext>['app'];

export const uniqueEmail = () => `persona+${randomUUID()}@example.com`;

/** A random address in 100.64.0.0/10 so rate-limit keys never collide between tests. */
export const randomIp = () => {
  const [a = 0, b = 0, c = 0] = randomBytes(3);
  return `100.${64 + (a % 64)}.${b}.${c}`;
};

export interface RequestOptions {
  /** Override the Origin header; `null` sends none. */
  origin?: string | null;
  contentType?: string;
  /** Send this exact body instead of JSON-encoding `body`. */
  rawBody?: string;
  /** Extra request headers, e.g. Idempotency-Key. */
  headers?: Record<string, string>;
}

/** A browser-like client: same origin, one IP, and a cookie jar. */
export class TestClient {
  private readonly cookies = new Map<string, string>();

  constructor(
    private readonly app: TestApp,
    readonly ip: string = randomIp(),
  ) {}

  async request(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<Response> {
    const headers = new Headers({ 'x-forwarded-for': this.ip });
    const origin = options.origin === undefined ? TEST_APP_URL : options.origin;
    if (origin !== null) headers.set('origin', origin);
    const payload = options.rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
    if (payload !== undefined)
      headers.set('content-type', options.contentType ?? 'application/json');
    for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
    if (this.cookies.size > 0) {
      headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    }
    const res = await this.app.request(`${TEST_APP_URL}${path}`, {
      method,
      headers,
      body: payload,
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

export type TestContext = ReturnType<typeof createTestContext>;

/** Registers, verifies and signs in a new account; the returned client is signed in. */
export async function signedInUser(
  ctx: TestContext,
): Promise<{ client: TestClient; email: string }> {
  const client = new TestClient(ctx.app);
  const email = uniqueEmail();
  const res = await client.request('POST', '/api/auth/sign-up/email', {
    name: 'Ana',
    email,
    password: TEST_PASSWORD,
    callbackURL: '/',
  });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status}`);
  const verified = await client.open(ctx.emails.lastLink(email));
  if (verified.status !== 302) throw new Error(`verification failed: ${verified.status}`);
  // Verification never signs in (login-CSRF defence), so sign in explicitly.
  const signIn = await client.request('POST', '/api/auth/sign-in/email', {
    email,
    password: TEST_PASSWORD,
  });
  if (signIn.status !== 200) throw new Error(`sign-in failed: ${signIn.status}`);
  return { client, email };
}
