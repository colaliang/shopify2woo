"use client";

import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { ReactNode, useEffect } from 'react';

export default function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      document.documentElement.lang = lng;
      document.documentElement.dir = i18n.dir(lng);
    };

    i18n.on('languageChanged', handleLanguageChanged);
    
    // Initial set
    if (i18n.resolvedLanguage) {
        handleLanguageChanged(i18n.resolvedLanguage);
    }

    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}
