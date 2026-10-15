export { getPreferences } from './application/preferences';
export { requireUser, type UserVariables } from './http/require-user';
export { meRoutes } from './http/routes';
export { type Auth, createAuth } from './infra/auth';
/** Only for foreign keys from other modules' tables (every user-owned row cascades). */
export { users as usersTable } from './infra/schema';
