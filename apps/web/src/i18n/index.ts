import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { es } from './es';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { es: { translation: es } },
    supportedLngs: ['es'],
    nonExplicitSupportedLngs: true,
    fallbackLng: 'es',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'finanz.language',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});

export default i18n;
