/**
 * A failed API call. `status` is 0 when the API could not be reached at all. `code` is the
 * stable error code from the body (Finanz errors and auth errors use different shapes).
 */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    /** Seconds to wait before retrying, when the API says so (rate limits). */
    readonly retryAfter?: number,
  ) {
    super(`API request failed: ${status}${code ? ` ${code}` : ''}`);
    this.name = 'ApiFailure';
  }
}

function errorCode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  // Finanz: { error: { code } }. Auth endpoints: { code }.
  const nested = (body as { error?: { code?: unknown } }).error?.code;
  const flat = (body as { code?: unknown }).code;
  const code = nested ?? flat;
  return typeof code === 'string' ? code : undefined;
}

function retryAfter(headers: Headers): number | undefined {
  const value = Number(headers.get('X-Retry-After') ?? headers.get('Retry-After'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Calls the Finanz API (same origin, session cookie) and returns the parsed JSON body. */
export async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  let res: Response;
  try {
    const headers = {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...extraHeaders,
    };
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: Object.keys(headers).length ? headers : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure(0, 'network');
  }
  const data = await readJson(res);
  if (!res.ok) throw new ApiFailure(res.status, errorCode(data), retryAfter(res.headers));
  return data as T;
}

export function isApiFailure(error: unknown, status?: number): error is ApiFailure {
  return error instanceof ApiFailure && (status === undefined || error.status === status);
}
