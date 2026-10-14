import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

/** Maps failures to the shared ApiError shape. Never leaks internals or request data. */
export const handleError: ErrorHandler = (err, c) => {
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'validation_failed',
          message: 'Invalid request data',
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      400,
    );
  }
  if (err instanceof SyntaxError) {
    return c.json({ error: { code: 'invalid_json', message: 'Body must be valid JSON' } }, 400);
  }
  if (err instanceof HTTPException) return err.getResponse();
  console.error('Unhandled error:', err instanceof Error ? err.name : 'unknown');
  return c.json({ error: { code: 'internal', message: 'Unexpected error' } }, 500);
};
