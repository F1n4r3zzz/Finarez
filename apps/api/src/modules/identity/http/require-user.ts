import type { MiddlewareHandler } from 'hono';
import type { Auth } from '../infra/auth';

export interface UserVariables {
  userId: string;
}

/** The only way a route learns who the user is: from the session, never from the request body. */
export function requireUser(auth: Auth): MiddlewareHandler<{ Variables: UserVariables }> {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: { code: 'auth.required', message: 'Sign in required' } }, 401);
    }
    c.set('userId', session.user.id);
    await next();
  };
}
