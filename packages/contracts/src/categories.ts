import { z } from 'zod';

const name = z.string().trim().min(1).max(60);
const id = z.uuid();

export const categoryInputSchema = z.object({
  kind: z.enum(['income', 'expense']),
  name,
  /** A root category of the same kind; subcategories go one level deep. */
  parentId: id.optional(),
});

export const categoryUpdateSchema = z
  .object({
    name: name.optional(),
    /** null makes it a root category. */
    parentId: id.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((u) => Object.keys(u).length > 0, { message: 'Nothing to change' });

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

export interface Category {
  id: string;
  kind: 'income' | 'expense';
  parentId: string | null;
  name: string;
  archived: boolean;
}
