import { describe, expect, it } from 'vitest';
import { safeNextPath } from './next-path';

describe('safeNextPath', () => {
  it('keeps paths inside the app, with their query and hash', () => {
    expect(safeNextPath('/accounts?view=all#top')).toBe('/accounts?view=all#top');
  });

  it.each([
    null,
    '',
    'accounts',
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example',
    '/\t/evil.example',
    'javascript:alert(1)',
  ])('falls back to the dashboard for %j', (next) => {
    expect(safeNextPath(next)).toBe('/');
  });
});
