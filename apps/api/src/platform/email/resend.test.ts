import { describe, expect, it, vi } from 'vitest';
import { EmailDeliveryError, ResendEmailSender } from './resend';

const MESSAGE = { to: 'ana@example.com', subject: 'Hola', text: 'Abre este enlace: https://x' };

describe('ResendEmailSender', () => {
  it('posts the message to Resend with the API key', async () => {
    const fetchFn = vi.fn(async () => Response.json({ id: 'e1' }));
    await new ResendEmailSender('re_key', 'Finarez <a@b.dev>', fetchFn).send(MESSAGE);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer re_key' });
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Finarez <a@b.dev>',
      to: ['ana@example.com'],
      subject: 'Hola',
      text: 'Abre este enlace: https://x',
    });
  });

  it('fails with the status only, so logs never carry the address', async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ message: 'ana@example.com' }, { status: 403 }),
    );
    const sending = new ResendEmailSender('re_key', 'Finarez <a@b.dev>', fetchFn).send(MESSAGE);
    await expect(sending).rejects.toThrow(EmailDeliveryError);
    await expect(sending).rejects.toMatchObject({ status: 403 });
    await expect(sending).rejects.not.toThrow(/ana@example\.com/);
  });
});
