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
      { error: 'Deepseek API key not configured. Please add DEEPSEEK_API_KEY to env variables.' },
      { status: 500 }
    );
  }

  try {
    const { title, body, language = 'en' } = await req.json();

    if (!body) {
        return NextResponse.json({ error: 'Body content is required for SEO analysis' }, { status: 400 });
    }

    const targetLang = languages.find(l => l.id === language)?.title || language;

    // 3. Construct Prompt
    const systemPrompt = `You are an SEO expert specializing in metadata optimization and keyword research.
    Your goal is to analyze the provided blog post content and generate comprehensive SEO metadata, structured data, and keywords.
    
    Requirements:
    - Language: ${targetLang} (IMPORTANT: The output content MUST be in this language)
    - Output Format: PURE JSON OBJECT. Do NOT wrap in markdown code blocks. The JSON must follow this schema:
    {
      "seo": {
        "metaTitle": "SEO optimized title (max 60 chars)",
        "metaDescription": "SEO optimized description (max 160 chars)",
        "keywords": ["keyword1", "keyword2", "keyword3", "long-tail keyword"],
        "focusKeyword": "The single most important keyword",
        "schemaType": "Article"
      },
      "excerpt": "A compelling summary (max 160 chars) for list views.",
      "keyTakeaways": ["Key Point 1", "Key Point 2", "Key Point 3"],
      "faq": [
        { "question": "Relevant Question 1", "answer": "Concise Answer 1" },
        { "question": "Relevant Question 2", "answer": "Concise Answer 2" }
      ],
      "openGraph": {
        "title": "Social sharing title",
        "description": "Social sharing description"
      },
      "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
    }

    Guidelines:
    1. **Keywords**: Identify high-value keywords relevant to the content. Include a mix of broad and long-tail keywords.
    2. **Meta Tags**: Ensure title and description are catchy and include the focus keyword.
    3. **Structured Data**: Extract key takeaways and potential FAQs from the content.
    4. **Accuracy**: Ensure the generated metadata accurately reflects the content provided.
    `;

    const userPrompt = `
    Blog Title: ${title || 'Untitled'}
    Blog Content: 
    ${body.substring(0, 5000)} // Truncate to avoid token limits if too long, though Deepseek has large context.
    
    Please analyze this content and generate the SEO JSON object.
    `;

    // 4. Call Deepseek API
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
        temperature: 0.3, // Low temperature for consistent analysis
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Deepseek API Error:', errorText);
        return NextResponse.json({ error: `Deepseek API Error: ${response.statusText}` }, { status: response.status });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    return NextResponse.json({ content });

  } catch (e) {
    console.error('AI SEO Analysis Error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
