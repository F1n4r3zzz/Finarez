import { randomInt } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../db/client';
import { testDatabaseUrl } from '../../test/database';
import { CapturingEmailSender } from '../../test/email';
import { BudgetedEmailSender, EmailBudget, reserveEmail, withEmailReservations } from './budget';
import { EmailBudgetExceededError } from './email';

const { db, pool } = createDatabase(testDatabaseUrl(), { max: 10 });
afterAll(() => pool.end());

// Each test counts against its own (far future) day.
const someDay = () => {
  const day = new Date(Date.UTC(2100, 0, 1) + randomInt(0, 300_000) * 86_400_000);
  return () => day;
};
const message = { to: 'ana@example.com', subject: 'Hola', text: 'Hola' };

describe('email budget', () => {
  it('sends up to the daily limit and then refuses', async () => {
    const inner = new CapturingEmailSender();
    const sender = new BudgetedEmailSender(inner, new EmailBudget(db, 2, someDay()));
    await sender.send(message);
    await sender.send(message);
    await expect(sender.send(message)).rejects.toBeInstanceOf(EmailBudgetExceededError);
    expect(inner.sent).toHaveLength(2);
  });

  it('never exceeds the limit under concurrent sends from several instances', async () => {
    const inner = new CapturingEmailSender();
    const day = someDay();
    const senders = [1, 2, 3].map(
      () => new BudgetedEmailSender(inner, new EmailBudget(db, 3, day)),
    );
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => senders[i % 3]?.send(message)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(inner.sent).toHaveLength(3);
  });

  it('sends nothing when the limit is zero', async () => {
    const inner = new CapturingEmailSender();
    const sender = new BudgetedEmailSender(inner, new EmailBudget(db, 0, someDay()));
    await expect(sender.send(message)).rejects.toBeInstanceOf(EmailBudgetExceededError);
    expect(inner.sent).toHaveLength(0);
  });

  it('an email sent within a request uses the unit that request reserved, not a second one', async () => {
    const inner = new CapturingEmailSender();
    const budget = new EmailBudget(db, 1, someDay());
    const sender = new BudgetedEmailSender(inner, budget);
    await withEmailReservations(async () => {
      expect(await reserveEmail(budget)).toBe(true);
      await sender.send(message); // uses the reservation; the budget (1) is not claimed again
    });
    expect(inner.sent).toHaveLength(1);
    expect(await budget.claim()).toBe(false);
  });
});
