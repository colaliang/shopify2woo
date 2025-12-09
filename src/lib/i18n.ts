import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';
import enTranslation from '../../public/locales/en/translation.json';

// List of supported languages
export const supportedLanguages = [
  'en', 'fr', 'de', 'es', 'it', 'ru', 'pt', 'zh-CN', 'zh-TW', 'ja', 'ko'
];

const isServer = typeof window === 'undefined';

// Initialize i18n instance with react-i18next
const i18nInstance = i18n.use(initReactI18next);

// Only use backend and detector on client side
if (!isServer) {
  i18nInstance
    .use(HttpBackend)
    .use(LanguageDetector);
}

i18nInstance.init({
  fallbackLng: 'en',
  supportedLngs: supportedLanguages,
  nonExplicitSupportedLngs: true,
  
  // Namespaces
  ns: ['translation'],
  defaultNS: 'translation',

  interpolation: {
    escapeValue: false, // not needed for react as it escapes by default
  },

  debug: process.env.NODE_ENV === 'development',

  // Conditional configuration based on environment
  ...(isServer ? {
    // Server-side (Build time / SSR)
    lng: 'en', // Force English on server to avoid hydration mismatch (mostly)
    resources: {
      en: {
        translation: enTranslation
      }
    },
    react: {
      useSuspense: false, // Disable suspense on server to avoid timeouts
    }
  } : {
    // Client-side
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    react: {
      useSuspense: true,
    }
  })
});

export default i18n;
