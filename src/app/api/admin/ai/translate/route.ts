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

    // Prepare system prompt for translation
    const systemPrompt = `You are a professional translator and localization expert. 
    You will receive a JSON object containing text fields.
    Your task is to translate the content into the following languages: ${langsToTranslate.join(', ')}.
    
    Output Format: PURE JSON OBJECT.
    Structure:
    {
      "${langsToTranslate[0]}": {
        "title": "Translated Title",
        "body": "Translated Body (Markdown)",
        "excerpt": "Translated Excerpt",
        "keyTakeaways": ["Translated Point 1", ...],
        "faq": [{ "question": "...", "answer": "..." }]
      },
      ...
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
    
    Please translate to: ${langsToTranslate.join(', ')}
    `;

    // Call Deepseek API
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
        temperature: 0.3, // Lower temperature for more accurate translation
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Deepseek API Error:', errorText);
        return NextResponse.json({ error: `Deepseek API Error: ${response.statusText}` }, { status: response.status });
    }

    const data = await response.json();
    const result = data.choices[0]?.message?.content || '{}';
    
    let parsedResult = {};
    try {
        parsedResult = JSON.parse(result);
    } catch (e) {
        console.error('Failed to parse AI response', e);
        // Try to salvage?
    }

    return NextResponse.json({ translations: parsedResult });

  } catch (e) {
    console.error('Translation Error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
