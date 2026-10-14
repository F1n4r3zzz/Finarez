export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set: copy .env.example to .env (see README).');
  }
  return url;
}

/** PostgreSQL SQLSTATE of an error, whether thrown directly or wrapped by Drizzle. */
export function pgErrorCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.cause?.code ?? e.code;
}
