import { CURRENCY_CODES, type CurrencyCode } from '@finanz/kernel';

export interface Option {
  value: string;
  label: string;
}

function capitalize(text: string, language: string): string {
  return text.charAt(0).toLocaleUpperCase(language) + text.slice(1);
}

/** "Peso colombiano (COP)", in the UI language. */
export function currencyOptions(language: string): Option[] {
  const names = new Intl.DisplayNames([language], { type: 'currency' });
  return CURRENCY_CODES.map((code: CurrencyCode) => ({
    value: code,
    label: `${capitalize(names.of(code) ?? code, language)} (${code})`,
  }));
}

function zoneName(timeZone: string, language: string): string | undefined {
  try {
    return new Intl.DateTimeFormat(language, { timeZone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value;
  } catch {
    // A zone this browser doesn't know (saved from another device): show its id alone.
    return undefined;
  }
}

/** "America/Bogota (hora estándar de Colombia)". */
export function timeZoneLabel(timeZone: string, language: string): string {
  const name = zoneName(timeZone, language);
  const id = timeZone.replaceAll('_', ' ');
  return name ? `${id} (${name})` : id;
}

/** Every IANA zone the browser knows, plus `include` (a saved zone it may list under an alias). */
export function timeZoneOptions(language: string, include: readonly string[] = []): Option[] {
  const zones = new Set([...include, ...Intl.supportedValuesOf('timeZone')]);
  return [...zones]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: timeZoneLabel(value, language) }));
}
