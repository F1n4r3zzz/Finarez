import { describe, expect, it } from 'vitest';
import { preferencesSchema } from './preferences';

describe('preferencesSchema', () => {
  it('accepts a complete, valid set of preferences', () => {
    const input = { language: 'es', timeZone: 'America/Bogota', primaryCurrency: 'COP' };
    expect(preferencesSchema.parse(input)).toEqual(input);
  });

  it('rejects unsupported languages, unknown time zones and currencies', () => {
    const result = preferencesSchema.safeParse({
      language: 'fr',
      timeZone: 'Mars/Olympus',
      primaryCurrency: 'BTC',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.')).sort()).toEqual([
      'language',
      'primaryCurrency',
      'timeZone',
    ]);
  });
});
