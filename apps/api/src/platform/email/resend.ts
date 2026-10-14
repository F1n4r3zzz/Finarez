import type { EmailMessage, EmailSender } from './email';

/** Resend answered with an error. Carries the status only, never the address. */
export class EmailDeliveryError extends Error {
  constructor(readonly status: number) {
    super(`Email provider answered ${status}`);
    this.name = 'EmailDeliveryError';
  }
}

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

/** Sends plain-text emails through Resend's HTTP API. */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await this.fetchFn(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new EmailDeliveryError(res.status);
  }
}
