"use client";

import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { ReactNode, useEffect, Suspense, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { supportedLanguages } from '@/lib/languages';

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
      <Suspense fallback={null}>
        <UrlSync mounted={mounted} />
      </Suspense>
      <Suspense fallback={<div className="p-4">Loading translations...</div>}>
        {children}
      </Suspense>
    </I18nextProvider>
  );
}

function UrlSync({ mounted }: { mounted: boolean }) {
  const { i18n } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sync URL with i18n language on mount and when language changes
  useEffect(() => {
    if (!mounted) return;

    const urlLng = searchParams.get('lng');
    const currentLng = i18n.resolvedLanguage;

    // Priority 1: Sync from URL to i18n
    // If URL has a supported language that differs from current i18n language, update i18n
    if (urlLng && supportedLanguages.includes(urlLng)) {
      if (urlLng !== currentLng) {
        i18n.changeLanguage(urlLng);
      }
    } 
    // Priority 2: Sync from i18n to URL
    // If URL is missing language or has unsupported language, update URL to match i18n
    else if (currentLng) {
      if (urlLng !== currentLng) {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('lng', currentLng);
        router.replace(`${pathname}?${newParams.toString()}`);
      }
    }
  }, [mounted, pathname, searchParams, router, i18n, i18n.resolvedLanguage]);

  return null;
}
