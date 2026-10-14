import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/modules/*/infra/schema.ts', './src/platform/*/schema.ts'],
  out: './migrations',
  casing: 'snake_case',
  migrations: { schema: 'drizzle' },
});
