import { describe, expect, it } from 'vitest';
import { formattingLocale } from './locale';

describe('formattingLocale', () => {
  it("uses the browser's region for the UI language", () => {
    expect(formattingLocale('es', ['en-US', 'es-MX'])).toBe('es-MX');
    expect(formattingLocale('es', ['es-CO', 'es'])).toBe('es-CO');
  });

  it('falls back to the UI language so words never switch language', () => {
    expect(formattingLocale('es', ['en-US', 'fr-FR'])).toBe('es');
  });
});
