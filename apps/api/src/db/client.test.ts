import { describe, expect, it } from 'vitest';
import { withVerifiedTls } from './client';

describe('withVerifiedTls', () => {
  it('turns the weak TLS modes of hosted URLs into full certificate verification', () => {
    expect(
      withVerifiedTls(
        'postgresql://u:p@ep-x.us-east-1.aws.neon.tech/db?sslmode=require&channel_binding=require',
      ),
    ).toBe(
      'postgresql://u:p@ep-x.us-east-1.aws.neon.tech/db?sslmode=verify-full&channel_binding=require',
    );
    expect(withVerifiedTls('postgres://u:p@h/db?sslmode=prefer')).toBe(
      'postgres://u:p@h/db?sslmode=verify-full',
    );
  });

  it('leaves local URLs and explicit choices alone', () => {
    for (const url of [
      'postgres://finanz:finanz_local@localhost:5432/finanz_dev',
      'postgres://u:p@h/db?sslmode=disable',
      'postgres://u:p@h/db?sslmode=verify-full',
      'not a url',
    ])
      expect(withVerifiedTls(url)).toBe(url);
  });
});
