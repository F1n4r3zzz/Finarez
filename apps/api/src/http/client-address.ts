/**
 * For requests reaching the Node listener directly: replace any client-supplied forwarding
 * headers with the socket's address, so rate limits can't be dodged or pinned on someone else
 * by faking x-forwarded-for (Codex CP3 #5).
 */
export function clientAddressFromSocket(
  request: Request,
  socketAddress: string | undefined,
): Request {
  const headers = new Headers(request.headers);
  headers.delete('x-real-ip');
  headers.delete('forwarded');
  if (socketAddress) headers.set('x-forwarded-for', socketAddress);
  else headers.delete('x-forwarded-for');
  return new Request(request, { headers, duplex: 'half' } as RequestInit);
}
