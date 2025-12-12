import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { languages } from '@/sanity/lib/languages';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // 1. Check Auth
  const { error, status } = await checkAdmin();
  if (error) return NextResponse.json({ error }, { status });

  // 2. Check API Key
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Deepseek API key not configured.' },
      { status: 500 }
    );
  }

  try {
    const { content, sourceLang = 'en', targetLangs } = await req.json();

    if (!content) {
        return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Identify which languages to translate to
    const langsToTranslate = targetLangs || languages.filter(l => l.id !== sourceLang).map(l => l.id);

    // Function to translate a single language
    const translateOne = async (lang: string) => {
        const systemPrompt = `You are a professional translator and localization expert. 
        You will receive a JSON object containing text fields.
        Your task is to translate the content into ${languages.find(l => l.id === lang)?.title || lang}.
        
        Output Format: PURE JSON OBJECT.
        Structure:
        {
          "title": "Translated Title",
          "body": "Translated Body (Markdown)",
          "excerpt": "Translated Excerpt",
          "keyTakeaways": ["Translated Point 1", ...],
          "faq": [{ "question": "...", "answer": "..." }]
        }
        
        Guidelines:
        - Maintain Markdown formatting.
        - Adapt cultural context where appropriate.
        - Ensure SEO keywords are naturally translated.
        - Do NOT translate technical terms that should remain in English (unless standard).
        `;

        const userPrompt = `
        Source Content (${sourceLang}):
        ${JSON.stringify(content, null, 2)}
        
        Please translate to: ${lang}
        `;

        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    stream: false,
                    temperature: 0.3,
                    max_tokens: 8000,
                    response_format: { type: 'json_object' }
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Deepseek API Error (${lang}):`, errorText);
                return null;
            }

            const data = await response.json();
            const resultString = data.choices[0]?.message?.content || '{}';
            const parsed = JSON.parse(resultString);
            return { [lang]: parsed };

        } catch (e) {
            console.error(`Translation failed for ${lang}:`, e);
            return null;
        }
    };

    // Run translations in parallel
    // We limit concurrency to 5 to avoid rate limits or timeouts if needed, 
    // but for now Promise.all with all 10 should be fine for Deepseek (usually high rate limits).
    const results = await Promise.all(langsToTranslate.map((lang: string) => translateOne(lang)));

    // Merge results
    const mergedResults = results.reduce((acc, curr) => {
        if (curr) return { ...acc, ...curr };
        return acc;
    }, {});

    return NextResponse.json({ translations: mergedResults });

  } catch (e) {
    console.error('Translation Error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
