/**
 * Where to go after signing in. Only paths inside this app are allowed, so a crafted link
 * cannot send someone to another site after they sign in.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  // Resolving against a dummy origin catches anything that would leave it.
  const base = 'https://finanz.invalid';
  const url = new URL(next, base);
  if (url.origin !== base) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}
