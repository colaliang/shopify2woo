import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// List of supported languages
export const supportedLanguages = [
  'en', 'fr', 'de', 'es', 'it', 'ru', 'pt', 'zh-CN', 'zh-TW', 'ja', 'ko'
];

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    nonExplicitSupportedLngs: true, // Allow e.g. en-US -> en
    
    // Namespaces
    ns: ['translation'],
    defaultNS: 'translation',

    // Backend configuration
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    // Detection configuration
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'], // persist language selection
      lookupLocalStorage: 'i18nextLng',
      // checkWhitelist is not a valid option in newer types, but logic is handled by supportedLngs + fallbackLng
    },

    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    
    // React configuration
    react: {
      useSuspense: true, // Enable suspense for loading
    },
    
    debug: process.env.NODE_ENV === 'development',
  });

export default i18n;
