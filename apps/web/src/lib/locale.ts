import i18n from 'i18next';

/**
 * Regional format for numbers and dates: the browser's region for the UI language
 * ("es-CO", "es-MX"), or the bare UI language if the browser lists none. Words such as
 * month names stay in the UI language; the region only changes how numbers are written.
 */
export function formattingLocale(
  uiLanguage: string = i18n.resolvedLanguage ?? 'es',
  browserLanguages: readonly string[] = navigator.languages,
): string {
  return browserLanguages.find((tag) => tag.split('-')[0] === uiLanguage) ?? uiLanguage;
}

export function detectedTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
