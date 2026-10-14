import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, randomIp, TestClient, uniqueEmail } from '../../test/context';

// Two API instances with separate connection pools, like two serverless functions.
const first = createTestContext();
const second = createTestContext();
afterAll(async () => {
  await first.close();
  await second.close();
});

describe('sign-in rate limit', () => {
  it('is shared across instances: the 6th attempt from one IP is refused on either', async () => {
    const ip = randomIp();
    const clients = [new TestClient(first.app, ip), new TestClient(second.app, ip)];
    const attempt = (n: number) =>
      clients[n % 2]?.request('POST', '/api/auth/sign-in/email', {
        email: uniqueEmail(),
        password: 'not the password',
      });

    for (let n = 0; n < 5; n++) {
      expect((await attempt(n))?.status).toBe(401);
    }
    const blocked = await attempt(5);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get('x-retry-after'))).toBeGreaterThan(0);
  });

  it('counts per IP, so other people are not locked out', async () => {
    const ip = randomIp();
    for (let n = 0; n < 6; n++) {
      await new TestClient(first.app, ip).request('POST', '/api/auth/sign-in/email', {
        email: uniqueEmail(),
        password: 'not the password',
      });
    }
    const someoneElse = await new TestClient(second.app).request(
      'POST',
      '/api/auth/sign-in/email',
      {
        email: uniqueEmail(),
        password: 'not the password',
      },
    );
    expect(someoneElse.status).toBe(401);
  });
});

describe('sign-in rate limit under concurrency', () => {
  it('lets exactly 5 of 12 simultaneous attempts through, across both instances', async () => {
    const ip = randomIp();
    const attempts = Array.from({ length: 12 }, (_, n) =>
      new TestClient(n % 2 === 0 ? first.app : second.app, ip).request(
        'POST',
        '/api/auth/sign-in/email',
        {
          email: uniqueEmail(),
          password: 'not the password',
        },
      ),
    );
    const statuses = (await Promise.all(attempts)).map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(7);
  });
});
