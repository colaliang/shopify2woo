import { Metadata } from 'next';
import HomeClient from "@/components/HomeClient";
import { getTranslations } from "@/lib/i18nServer";
import { supportedLanguages } from '@/lib/languages';

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const lng = typeof resolvedSearchParams.lng === 'string' ? resolvedSearchParams.lng : 'en';
  const t = await getTranslations(lng);

  const title = t?.app?.title || "Shopify/Wix/WP to WooCommerce Importer";
  const description = t?.app?.description || "Professional cross-border e-commerce product migration tool";
  const keywords = t?.app?.keywords 
    ? t.app.keywords.split(',').map(k => k.trim()) 
    : ["WordPress Migration", "Shopify to WooCommerce", "Wix to WooCommerce", "Product Import", "WooCommerce Importer", "Yundian+"];
  
  const baseUrl = "https://www.ydplus.net";

  // Generate alternates for SEO
  const languages: Record<string, string> = {};
  supportedLanguages.forEach(lang => {
    languages[lang] = `${baseUrl}/?lng=${lang}`;
  });

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: `${baseUrl}${lng !== 'en' ? `/?lng=${lng}` : ''}`,
      languages: languages,
    },
    openGraph: {
        title,
        description,
        locale: lng.replace('-', '_'),
    },
    twitter: {
        title,
        description,
    }
  };
}

export default function Home() {
  return <HomeClient />;
}
