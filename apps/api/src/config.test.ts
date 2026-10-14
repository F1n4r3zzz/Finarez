import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('accepts a PostgreSQL URL and defaults the port', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' });
    expect(config).toEqual({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', PORT: 3000 });
  });

  it('rejects a missing or non-PostgreSQL URL without echoing its value', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    try {
      loadConfig({ DATABASE_URL: 'https://secret-token@example.com' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/DATABASE_URL/);
      expect((error as Error).message).not.toContain('secret-token');
    }
  });
});
