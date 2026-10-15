import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { signedInUser, TestClient, type TestContext } from './context';

/**
 * How an intruder might reach another user's data:
 * - single, nested: read one resource (or one inside it) by id → must be 404
 * - write, bulk: change it, alone or mixed with the intruder's own ids → must be 404
 * - list, aggregate: collections and totals → 200 with exactly the intruder's own data
 */
export type ProbeKind = 'single' | 'nested' | 'write' | 'bulk' | 'list' | 'aggregate';

interface ProbeRequest {
  method: string;
  path: string;
  body?: unknown;
}

export type Probe =
  | (ProbeRequest & { kind: 'single' | 'nested' | 'write' | 'bulk' })
  | (ProbeRequest & {
      kind: 'list' | 'aggregate';
      /**
       * Exactly what the intruder must get back: their own data only. Required because a
       * leaking total rarely echoes the owner's number; it is just wrong (contaminated).
       */
      intruderSees: unknown;
    });

export interface Seeded {
  /** Requests the intruder will try, built from the owner's real ids. */
  probes: Probe[];
  /** Values unique to the owner's data (text, amounts); none may appear in a response. */
  secrets: string[];
  /** Re-reads as the owner: false if any intruder request changed the owner's data. */
  ownerDataIntact: () => Promise<boolean>;
}

export interface Violation {
  probe: string;
  reason: string;
}

const MUST_BE_NOT_FOUND = new Set<ProbeKind>(['single', 'nested', 'write', 'bulk']);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Reusable cross-user check for any module. `seed` creates data as the owner (and, if useful,
 * some of the intruder's own) and returns the probes; the intruder (another signed-in user)
 * and an anonymous visitor try each one. Returns every violation, so tests assert `toEqual([])`.
 */
export async function findIsolationViolations(
  ctx: TestContext,
  seed: (owner: TestClient, intruder: TestClient) => Promise<Seeded>,
): Promise<Violation[]> {
  const { client: owner } = await signedInUser(ctx);
  const { client: intruder } = await signedInUser(ctx);
  const anonymous = new TestClient(ctx.app);
  const { probes, secrets, ownerDataIntact } = await seed(owner, intruder);
  const violations: Violation[] = [];

  for (const probe of probes) {
    const label = `${probe.kind}: ${probe.method} ${probe.path}`;

    // Like a real client, every request carries a fresh Idempotency-Key.
    const headers = { headers: { 'Idempotency-Key': randomUUID() } };
    const anon = await anonymous.request(probe.method, probe.path, probe.body, headers);
    const anonText = await anon.text();
    const anonLeaked = secrets.filter((secret) => anonText.includes(secret));
    if (anonLeaked.length > 0) {
      violations.push({
        probe: label,
        reason: `anonymous response contains the owner's data: ${anonLeaked.join(', ')}`,
      });
    }
    if (anon.status !== 401) {
      violations.push({
        probe: label,
        reason: `anonymous request got ${anon.status}, expected 401`,
      });
    }

    const res = await intruder.request(probe.method, probe.path, probe.body, headers);
    const text = await res.text();
    if (MUST_BE_NOT_FOUND.has(probe.kind) && res.status !== 404) {
      violations.push({ probe: label, reason: `intruder got ${res.status}, expected 404` });
    }
    if (probe.kind === 'list' || probe.kind === 'aggregate') {
      if (res.status !== 200) {
        violations.push({ probe: label, reason: `intruder got ${res.status}, expected 200` });
      } else if (!isDeepStrictEqual(parseJson(text), probe.intruderSees)) {
        violations.push({
          probe: label,
          reason: `intruder saw more than their own data: ${text.slice(0, 200)}`,
        });
      }
    }
    const leaked = secrets.filter((secret) => text.includes(secret));
    if (leaked.length > 0) {
      violations.push({
        probe: label,
        reason: `response contains the owner's data: ${leaked.join(', ')}`,
      });
    }
  }

  if (!(await ownerDataIntact())) {
    violations.push({ probe: 'owner data', reason: "intruder requests changed the owner's data" });
  }
  return violations;
}
