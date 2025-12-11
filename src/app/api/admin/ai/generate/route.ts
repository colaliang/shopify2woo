import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs'; // Switch back to nodejs as we don't need edge streaming anymore

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
    const { title, keywords, requirements, language = 'en' } = await req.json();

    if (!title) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // 3. Construct Prompt
    const systemPrompt = `You are an SEO marketing expert and GEO optimization expert, specializing in writing software tool recommendation content.
    Your goal is to write a high-quality blog post that is optimized for search engines (Google, Bing, Baidu) and meets mainstream AI content indexing standards.
    
    Requirements:
    - Language: ${language === 'zh-CN' ? 'Simplified Chinese' : language === 'zh-TW' ? 'Traditional Chinese' : 'English'}
    - Output Format: PURE JSON OBJECT. Do NOT wrap in markdown code blocks. The JSON must follow this schema:
    {
      "title": "Optimized Blog Title (max 60 chars)",
      "slug": "url-friendly-slug-based-on-title",
      "body": "The full blog post content in Markdown format. Use H2/H3, bullet points, tables.",
      "excerpt": "A short summary (max 160 chars) for list views.",
      "seo": {
        "metaTitle": "SEO optimized title (max 60 chars)",
        "metaDescription": "SEO optimized description (max 160 chars)",
        "keywords": ["keyword1", "keyword2", "keyword3"],
        "focusKeyword": "The main keyword",
        "schemaType": "Article"
      },
      "openGraph": {
        "title": "Social sharing title",
        "description": "Social sharing description"
      },
      "tags": ["tag1", "tag2", "tag3"]
    }

    Content Guidelines:
    - Length: 800-1500 words for the 'body' field.
    - SEO: Naturally integrate keywords (density 3-5%).
    - Structure: Use H2/H3 for subsections.
    - Tables: Use responsive Markdown tables where appropriate.
    - Tone: Professional, helpful, and engaging.
    `;

    const userPrompt = `
    Blog Title: ${title}
    Target Keywords: ${Array.isArray(keywords) ? keywords.join(', ') : keywords}
    Specific Requirements: ${requirements || 'None'}
    
    Please write the article now and return ONLY the JSON object.
    `;

    // 4. Call Deepseek API (Non-streaming)
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
        stream: false, // Disable streaming
        temperature: 0.7,
        max_tokens: 4000, // Increased token limit for JSON overhead
        response_format: { type: 'json_object' } // Force JSON output if supported (Deepseek might not support this explicit flag yet, but prompt engineering works)
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
    console.error('AI Generation Error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
