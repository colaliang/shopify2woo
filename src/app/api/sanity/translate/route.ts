import { NextResponse } from 'next/server';

// Real Deepseek API call
async function callDeepseek(text: string, targetLang: string) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  // Map our language codes to standard ones if necessary
  // Deepseek generally understands standard codes like zh-CN, fr, etc.
  const prompt = `Translate the following text to ${targetLang}. Only return the translated text, no explanations or quotes.
Text: ${text}`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are a helpful translation assistant." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Deepseek API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('No content in Deepseek response');
  }

  return content.trim();
}

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
