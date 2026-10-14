import type { Preferences } from '@finanz/contracts';
import { type CurrencyCode, isCurrencyCode } from '@finanz/kernel';
import { detectedTimeZone, formattingLocale } from '../../lib/locale';

const MEXICO_ZONES = new Set(
  'Mexico_City Cancun Merida Monterrey Matamoros Chihuahua Ciudad_Juarez Ojinaga Mazatlan Bahia_Banderas Hermosillo Tijuana'
    .split(' ')
    .map((city) => `America/${city}`),
);
// Euro area members, by region code.
const EURO_REGIONS = new Set(
  'AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES AD MC SM VA ME XK'.split(' '),
);
const REGION_CURRENCY: Record<string, CurrencyCode> = { CO: 'COP', MX: 'MXN', US: 'USD' };

function regionOf(locale: string): string | undefined {
  try {
    return new Intl.Locale(locale).region;
  } catch {
    return undefined;
  }
}

/**
 * A first guess at the main currency, which the user confirms. The time zone says more about
 * where someone lives than the browser language does (many people use English browsers).
 */
export function guessCurrency(
  timeZone: string = detectedTimeZone(),
  locale: string = formattingLocale(),
): CurrencyCode {
  if (timeZone === 'America/Bogota') return 'COP';
  if (MEXICO_ZONES.has(timeZone)) return 'MXN';
  const region = regionOf(locale);
  if (region && EURO_REGIONS.has(region)) return 'EUR';
  if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  return timeZone.startsWith('Europe/') ? 'EUR' : 'USD';
}

/** What the first-setup form starts with. */
export function suggestedPreferences(): Preferences {
  return { language: 'es', timeZone: detectedTimeZone(), primaryCurrency: guessCurrency() };
}

/** Reads the preferences form; `undefined` if a value is missing or not one we offer. */
export function preferencesFromForm(
  form: FormData,
  language: Preferences['language'],
): Preferences | undefined {
  const currency = form.get('primaryCurrency');
  const timeZone = form.get('timeZone');
  if (typeof currency !== 'string' || !isCurrencyCode(currency)) return undefined;
  if (typeof timeZone !== 'string' || !timeZone) return undefined;
  return { language, timeZone, primaryCurrency: currency };
}
