/** Short words a name's initials skip ("Fondo de inversión" is FI, not FD). */
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'a', 'en']);

/**
 * Two letters that stand for an account or category in a badge: the initials of the first two
 * words, or the first two letters of a single word ("Nequi" is Ne).
 */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !CONNECTORS.has(w.toLocaleLowerCase('es')));
  const [first, second] = meaningful.length > 0 ? meaningful : words;
  if (!first) return '?';
  if (second) return `${first[0]}${second[0]}`.toLocaleUpperCase('es');
  return `${first[0]?.toLocaleUpperCase('es')}${(first[1] ?? '').toLocaleLowerCase('es')}`;
}
