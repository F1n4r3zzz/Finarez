import type { EmailMessage, EmailSender } from '../platform/email/email';

/** Keeps sent emails in memory so tests can open the links in them. */
export class CapturingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  to(address: string): EmailMessage[] {
    return this.sent.filter((m) => m.to === address);
  }

  /** The link in the latest email to `address`. */
  lastLink(address: string): URL {
    const last = this.to(address).at(-1);
    const match = last?.text.match(/https?:\/\/\S+/);
    if (!match) throw new Error(`No link emailed to ${address}`);
    return new URL(match[0]);
  }
}
