import { sql } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { EmailBudgetExceededError, type EmailMessage, type EmailSender } from './email';
import { emailSends } from './schema';

/**
 * Caps emails per UTC day across all instances. The counter is claimed atomically in
 * Postgres before sending, so concurrent requests can never exceed the limit.
 */
export class BudgetedEmailSender implements EmailSender {
  constructor(
    private readonly inner: EmailSender,
    private readonly db: Executor,
    private readonly dailyLimit: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const day = this.now().toISOString().slice(0, 10);
    const claimed =
      this.dailyLimit > 0 &&
      (
        await this.db
          .insert(emailSends)
          .values({ day, count: 1 })
          .onConflictDoUpdate({
            target: emailSends.day,
            set: { count: sql`${emailSends.count} + 1` },
            setWhere: sql`${emailSends.count} < ${this.dailyLimit}`,
          })
          .returning({ count: emailSends.count })
      ).length > 0;
    if (!claimed) throw new EmailBudgetExceededError();
    await this.inner.send(message);
  }
}
