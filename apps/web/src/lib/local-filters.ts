import type { ShouldRevalidateFunctionArgs } from 'react-router';

/** Filters a page applies to what it already loaded: changing them needs no request. */
const LOCAL_FILTERS = new Set(['cat', 'q']);

/**
 * True when a navigation only changed local filters. A refresh of the same address (the shell
 * does one after recording recurring movements) or a submitted form is never "only filters".
 */
export function onlyLocalFiltersChanged({
  currentUrl,
  nextUrl,
  formMethod,
}: Pick<ShouldRevalidateFunctionArgs, 'currentUrl' | 'nextUrl' | 'formMethod'>): boolean {
  if (formMethod || currentUrl.pathname !== nextUrl.pathname) return false;
  if (currentUrl.search === nextUrl.search) return false;
  const rest = (url: URL) =>
    [...url.searchParams].filter(([key]) => !LOCAL_FILTERS.has(key)).join('&');
  return rest(currentUrl) === rest(nextUrl);
}
