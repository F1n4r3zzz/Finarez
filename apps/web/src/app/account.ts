import type { ConsentStatus, Preferences } from '@finanz/contracts';
import {
  type LoaderFunctionArgs,
  redirect,
  type ShouldRevalidateFunctionArgs,
  useRouteLoaderData,
} from 'react-router';
import { getSession, type SessionUser } from '../features/auth/auth-api';
import { api, isApiFailure } from '../lib/api';
import { onlyLocalFiltersChanged } from '../lib/local-filters';
import { safeNextPath } from '../lib/next-path';

/** The signed-in user and their saved preferences, loaded once for the whole app. */
export interface Account {
  user: SessionUser;
  preferences: Preferences;
}

export const APP_ROUTE_ID = 'app';

/** `null` until the user saves them for the first time; `undefined` when signed out. */
async function getPreferences(): Promise<Preferences | null | undefined> {
  try {
    return await api<Preferences>('GET', '/me/preferences');
  } catch (error) {
    if (isApiFailure(error, 404)) return null;
    if (isApiFailure(error, 401)) return undefined;
    throw error;
  }
}

/** What the user still has to accept; `undefined` when signed out. */
async function getConsents(): Promise<ConsentStatus | undefined> {
  try {
    return await api<ConsentStatus>('GET', '/me/consents');
  } catch (error) {
    if (isApiFailure(error, 401)) return undefined;
    throw error;
  }
}

export async function savePreferences(preferences: Preferences): Promise<Preferences> {
  return api<Preferences>('PUT', '/me/preferences', preferences);
}

/** `page`, set to come back to the current address afterwards. */
function returningHere(page: string, request: Request): string {
  const url = new URL(request.url);
  const here = `${url.pathname}${url.search}`;
  return here === '/' ? page : `${page}?next=${encodeURIComponent(here)}`;
}

export const signInPath = (request: Request) => returningHere('/sign-in', request);

/** Where to continue after signing in or setting up: the `next` address, if it is safe. */
export function nextPath(request: Request): string {
  return safeNextPath(new URL(request.url).searchParams.get('next'));
}

export async function loadAccount() {
  const [user, preferences, consents] = await Promise.all([
    getSession(),
    getPreferences(),
    getConsents(),
  ]);
  return { user: preferences === undefined ? null : user, preferences, consents };
}

/**
 * The app needs a session, the current terms accepted and saved preferences; otherwise sign
 * in, accept or set them up first.
 */
export async function accountLoader({ request }: LoaderFunctionArgs): Promise<Account> {
  const { user, preferences, consents } = await loadAccount();
  if (!user) throw redirect(signInPath(request));
  if (consents?.pending.length) throw redirect(returningHere('/accept-terms', request));
  if (!preferences) throw redirect(returningHere('/welcome', request));
  return { user, preferences };
}

/** First-time setup: only for signed-in users who haven't saved preferences yet. */
export async function welcomeLoader({ request }: LoaderFunctionArgs): Promise<null> {
  const { user, preferences, consents } = await loadAccount();
  if (!user) throw redirect(signInPath(request));
  if (consents?.pending.length) throw redirect(returningHere('/accept-terms', request));
  if (preferences) throw redirect(nextPath(request));
  return null;
}

/**
 * Sign-in and sign-up pages send signed-in users on to the app. "Signed in" is decided
 * exactly as the app decides it, so the two can never redirect to each other in a loop.
 */
export async function guestOnlyLoader({ request }: LoaderFunctionArgs): Promise<null> {
  let user: SessionUser | null = null;
  try {
    ({ user } = await loadAccount());
  } catch {
    // The API is unreachable: show the form anyway; submitting it explains the problem.
  }
  if (user) throw redirect(nextPath(request));
  return null;
}

export function useAccount(): Account {
  const account = useRouteLoaderData<Account>(APP_ROUTE_ID);
  if (!account) throw new Error('useAccount is only available inside the app routes');
  return account;
}

/** The session and preferences don't change when a page only narrows what it shows. */
export function accountShouldRevalidate(args: ShouldRevalidateFunctionArgs) {
  return onlyLocalFiltersChanged(args) ? false : args.defaultShouldRevalidate;
}
