"use client";

import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { ReactNode, useEffect, Suspense, useState } from 'react';

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
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

  // Prevent hydration mismatch by rendering only after mount
  // This ensures client side logic (including language detection) takes over cleanly
  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <Suspense fallback={<div className="p-4">Loading translations...</div>}>
        {children}
      </Suspense>
    </I18nextProvider>
  );
}
