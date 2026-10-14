import type { MiddlewareHandler } from 'hono';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence: a state-changing request must carry the app's own Origin. Browsers always
 * send Origin on cross-site requests, so a foreign or missing Origin is refused.
 */
export function sameOriginMutations(appUrl: string): MiddlewareHandler {
  const allowed = new URL(appUrl).origin;
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method) && c.req.header('origin') !== allowed) {
      return c.json(
        { error: { code: 'request.cross_origin', message: 'Cross-origin request refused' } },
        403,
      );
    }
    await next();
  };
}

/**
 * Request bodies must be JSON. Blocks form posts and other "simple" cross-site requests that
 * skip the browser's CORS preflight. Bodiless requests (e.g. sign-out) are allowed.
 */
export function jsonBodiesOnly(): MiddlewareHandler {
  return async (c, next) => {
    const hasBody = c.req.raw.body !== null && c.req.header('content-length') !== '0';
    const type = c.req.header('content-type') ?? '';
    if (hasBody && !/^application\/json\s*(;|$)/i.test(type)) {
      return c.json(
        {
          error: {
            code: 'request.unsupported_media_type',
            message: 'Request body must be application/json',
          },
        },
        415,
      );
    }
    await next();
  };
}
