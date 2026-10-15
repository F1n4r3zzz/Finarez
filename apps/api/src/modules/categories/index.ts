export { ensureDefaultCategories } from './application/categories';
export { categoryRoutes } from './http/routes';
/** Only for foreign keys from other modules' tables. */
export { categories as categoriesTable } from './infra/schema';
