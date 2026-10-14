import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { EmailBudgetExceededError, type EmailMessage, type EmailSender } from './email';
import { emailSends } from './schema';

/**
 * Caps emails per UTC day across all instances. Each unit is claimed atomically in Postgres,
 * so concurrent requests on any number of servers can never exceed the limit.
 */
export class EmailBudget {
  constructor(
    private readonly db: Executor,
    private readonly dailyLimit: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Takes one unit of today's budget; false if none is left. */
  async claim(): Promise<boolean> {
    if (this.dailyLimit <= 0) return false;
    const day = this.now().toISOString().slice(0, 10);
    const claimed = await this.db
      .insert(emailSends)
      .values({ day, count: 1 })
      .onConflictDoUpdate({
        target: emailSends.day,
        set: { count: sql`${emailSends.count} + 1` },
        setWhere: sql`${emailSends.count} < ${this.dailyLimit}`,
      })
      .returning({ count: emailSends.count });
    return claimed.length > 0;
  }
}

/** Units this request already claimed, to be used by the emails it sends. */
const reservations = new AsyncLocalStorage<{ reserved: number }>();

/** Runs `fn` (one HTTP request) with its own reservation slot. */
export function withEmailReservations<T>(fn: () => Promise<T>): Promise<T> {
  return reservations.run({ reserved: 0 }, fn);
}

/**
 * Claims a unit up front, before anything about the account is looked up, so an exhausted
 * budget looks the same for every address (no account discovery; Codex CP3 #2).
 */
export async function reserveEmail(budget: EmailBudget): Promise<boolean> {
  if (!(await budget.claim())) return false;
  const slot = reservations.getStore();
  if (slot) slot.reserved += 1;
  return true;
}

/** Sends within the budget: uses a unit reserved by this request, or claims one. */
export class BudgetedEmailSender implements EmailSender {
  constructor(
    private readonly inner: EmailSender,
    private readonly budget: EmailBudget,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const slot = reservations.getStore();
    if (slot && slot.reserved > 0) slot.reserved -= 1;
    else if (!(await this.budget.claim())) throw new EmailBudgetExceededError();
    await this.inner.send(message);
  }
}
