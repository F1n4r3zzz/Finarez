import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  APP_URL: 'http://localhost:5173',
  AUTH_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    expect(loadConfig(valid)).toMatchObject({
      ...valid,
      PORT: 3000,
      NODE_ENV: 'development',
      EMAIL_TRANSPORT: 'console',
      EMAIL_DAILY_LIMIT: 90,
    });
  });

  it('rejects a missing or non-PostgreSQL URL without echoing its value', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    try {
      loadConfig({ ...valid, DATABASE_URL: 'https://secret-token@example.com' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/DATABASE_URL/);
      expect((error as Error).message).not.toContain('secret-token');
    }
  });

  it('requires a long auth secret', () => {
    expect(() => loadConfig({ ...valid, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });

  it('refuses to print emails to the console in production', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow(/EMAIL_TRANSPORT/);
  });
});
