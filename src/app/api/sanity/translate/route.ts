import { NextResponse } from 'next/server';
import { callDeepseek } from '@/lib/translate';

export async function POST(req: Request) {
  try {
    const { text, targetLangs } = await req.json();

    if (!text || !targetLangs || !Array.isArray(targetLangs)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const translations: Record<string, string> = {};

    // Parallel execution for speed (in production, batch if API supports it)
    await Promise.all(targetLangs.map(async (lang) => {
      try {
        const translated = await callDeepseek(text, lang);
        translations[lang] = translated;
      } catch (e) {
        console.error(`Failed to translate to ${lang}`, e);
        // Optionally keep going or return error
      }
    }));

    return NextResponse.json(translations);

  } catch (error) {
    console.error('Translation API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
