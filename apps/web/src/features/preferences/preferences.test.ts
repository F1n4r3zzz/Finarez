import { describe, expect, it } from 'vitest';
import { guessCurrency, preferencesFromForm } from './defaults';
import { currencyOptions, timeZoneLabel, timeZoneOptions } from './options';

describe('guessCurrency', () => {
  it.each([
    ['America/Bogota', 'en-US', 'COP'],
    ['America/Mexico_City', 'es', 'MXN'],
    ['America/Tijuana', 'en-US', 'MXN'],
    ['America/New_York', 'es-ES', 'EUR'],
    ['America/Lima', 'es-CO', 'COP'],
    ['America/Lima', 'es', 'USD'],
    ['Europe/Madrid', 'es', 'EUR'],
    ['Asia/Tokyo', 'ja-JP', 'USD'],
  ])('guesses from %s and %s: %s', (timeZone, locale, currency) => {
    expect(guessCurrency(timeZone, locale)).toBe(currency);
  });
});

describe('preferences options', () => {
  it('names currencies in Spanish with their code', () => {
    expect(currencyOptions('es').map((o) => o.label)).toEqual([
      'Dólar estadounidense (USD)',
      'Euro (EUR)',
      'Peso colombiano (COP)',
      'Peso mexicano (MXN)',
    ]);
  });

  it('labels zones with their Spanish name', () => {
    expect(timeZoneLabel('America/Bogota', 'es')).toBe(
      'America/Bogota (hora estándar de Colombia)',
    );
    expect(timeZoneLabel('Not/A_Zone', 'es')).toBe('Not/A Zone');
  });

  it('keeps a saved zone that the browser does not list (UTC is valid but not listed)', () => {
    const zones = timeZoneOptions('es', ['UTC']).map((o) => o.value);
    expect(zones).toContain('UTC');
    expect(zones).toContain('America/Mexico_City');
  });
});

describe('preferencesFromForm', () => {
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  };

  it('reads the currency and time zone', () => {
    expect(
      preferencesFromForm(form({ primaryCurrency: 'MXN', timeZone: 'America/Merida' }), 'es'),
    ).toEqual({ language: 'es', primaryCurrency: 'MXN', timeZone: 'America/Merida' });
  });

  it('rejects a currency Finarez does not offer', () => {
    expect(preferencesFromForm(form({ primaryCurrency: 'BTC', timeZone: 'UTC' }), 'es')).toBe(
      undefined,
    );
  });
});
