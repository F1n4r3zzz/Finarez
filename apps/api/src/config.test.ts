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
      AUTH_SIGN_IN_LIMIT: 5,
      AUTH_SIGN_UP_LIMIT: 5,
    });
  });

  it('never loosens the sign-in or sign-up limits in production', () => {
    const production = {
      ...valid,
      NODE_ENV: 'production',
      EMAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: 'k',
    };
    expect(() => loadConfig({ ...production, AUTH_SIGN_IN_LIMIT: '50' })).toThrow(
      /AUTH_SIGN_IN_LIMIT/,
    );
    expect(() => loadConfig({ ...production, AUTH_SIGN_UP_LIMIT: '50' })).toThrow(
      /AUTH_SIGN_UP_LIMIT/,
    );
    expect(
      loadConfig({ ...valid, NODE_ENV: 'test', AUTH_SIGN_IN_LIMIT: '50' }).AUTH_SIGN_IN_LIMIT,
    ).toBe(50);
    expect(
      loadConfig({ ...valid, NODE_ENV: 'test', AUTH_SIGN_UP_LIMIT: '50' }).AUTH_SIGN_UP_LIMIT,
    ).toBe(50);
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

  it('sends through Resend in production, and requires its key', () => {
    const production = { ...valid, NODE_ENV: 'production', EMAIL_TRANSPORT: 'resend' };
    expect(() => loadConfig(production)).toThrow(/RESEND_API_KEY/);
    expect(loadConfig({ ...production, RESEND_API_KEY: 're_test' })).toMatchObject({
      EMAIL_TRANSPORT: 'resend',
      EMAIL_FROM: 'Finanz <onboarding@resend.dev>',
    });
  });
});
