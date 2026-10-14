import { describe, expect, it } from 'vitest';
import { clientAddressFromSocket } from './client-address';

const req = (headers: Record<string, string>) =>
  new Request('http://localhost/api/auth/sign-in/email', { method: 'POST', headers, body: '{}' });

describe('clientAddressFromSocket', () => {
  it('replaces a spoofed or multi-address x-forwarded-for with the socket address', () => {
    const out = clientAddressFromSocket(
      req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }),
      '192.0.2.7',
    );
    expect(out.headers.get('x-forwarded-for')).toBe('192.0.2.7');
  });

  it('drops other forwarding headers a client could fake', () => {
    const out = clientAddressFromSocket(
      req({ 'x-real-ip': '1.2.3.4', forwarded: 'for=1.2.3.4' }),
      '192.0.2.7',
    );
    expect(out.headers.get('x-real-ip')).toBeNull();
    expect(out.headers.get('forwarded')).toBeNull();
  });

  it('removes the header when the socket address is unknown, instead of trusting the client', () => {
    const out = clientAddressFromSocket(req({ 'x-forwarded-for': '1.2.3.4' }), undefined);
    expect(out.headers.get('x-forwarded-for')).toBeNull();
  });

  it('keeps the method and body', async () => {
    const out = clientAddressFromSocket(req({}), '192.0.2.7');
    expect(out.method).toBe('POST');
    expect(await out.text()).toBe('{}');
  });
});
