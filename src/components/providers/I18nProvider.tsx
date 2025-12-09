"use client";

import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { ReactNode, useEffect, Suspense, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sync URL with i18n language on mount and when language changes
  useEffect(() => {
    if (mounted && i18n.resolvedLanguage) {
      const currentLng = i18n.resolvedLanguage;
      const urlLng = searchParams.get('lng');

      if (urlLng !== currentLng) {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('lng', currentLng);
        router.replace(`${pathname}?${newParams.toString()}`);
      }
    }
  }, [mounted, pathname, searchParams, router]);

  return null;
}
