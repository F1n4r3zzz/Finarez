import { categoryInputSchema, categoryUpdateSchema } from '@finanz/contracts';
import { Hono } from 'hono';
import type { Database } from '../../../db/client';
import { isUuid } from '../../../http/ids';
import { type Auth, requireUser, type UserVariables } from '../../identity';
import {
  CategoryConflictError,
  CategoryNotFoundError,
  createCategory,
  listCategories,
  updateCategory,
} from '../application/categories';

const notFound = { error: { code: 'not_found', message: 'Not found' } } as const;

/** The user's income and expense categories, mounted at /api/categories. */
export function categoryRoutes({ auth, db }: { auth: Auth; db: Database }) {
  return new Hono<{ Variables: UserVariables }>()
    .use(requireUser(auth))
    .onError((error, c) => {
      if (error instanceof CategoryNotFoundError) return c.json(notFound, 404);
      if (error instanceof CategoryConflictError) {
        return c.json({ error: { code: error.code, message: error.message } }, 409);
      }
      throw error;
    })
    .get('/', async (c) => c.json(await listCategories(db, c.var.userId)))
    .post('/', async (c) => {
      const input = categoryInputSchema.parse(await c.req.json());
      return c.json(await createCategory(db, c.var.userId, input), 201);
    })
    .patch('/:id', async (c) => {
      const input = categoryUpdateSchema.parse(await c.req.json());
      const id = c.req.param('id');
      if (!isUuid(id)) return c.json(notFound, 404);
      return c.json(await updateCategory(db, c.var.userId, id, input));
    });
}
