import fs from 'fs';
import path from 'path';
import { supportedLanguages } from '@/lib/i18n';

interface Translations {
  app: {
    title: string;
    description: string;
  };
  [key: string]: unknown;
}

export async function getTranslations(lang: string): Promise<Translations | null> {
  // Validate language
  const targetLang = supportedLanguages.includes(lang) ? lang : 'en';
  
  try {
    const filePath = path.join(process.cwd(), 'public', 'locales', targetLang, 'translation.json');
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Failed to load translations for ${targetLang}:`, error);
    // Fallback to English if file missing
    if (targetLang !== 'en') {
        return getTranslations('en');
    }
    return null;
  }
}
