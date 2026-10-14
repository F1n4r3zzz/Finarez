// Rebuilds the test database from the migrations, as the API tests do. Used by the e2e run.
import resetTestDatabase from './global-setup';

await resetTestDatabase();
