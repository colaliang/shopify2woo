import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

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
    const { title, body, keywords, requirements, language = 'en' } = await req.json();

    if (!title && !body) {
        return NextResponse.json({ error: 'Title or Body is required for optimization' }, { status: 400 });
    }

    // 3. Construct Prompt
    const systemPrompt = `You are an SEO marketing expert and content editor.
    Your goal is to OPTIMIZE an existing blog post to be high-quality, SEO-friendly, and meet E-E-A-T standards.
    
    Requirements:
    - Language: ${language === 'zh-CN' ? 'Simplified Chinese' : language === 'zh-TW' ? 'Traditional Chinese' : 'English'}
    - Output Format: PURE JSON OBJECT. Do NOT wrap in markdown code blocks. The JSON must follow this schema:
    {
      "title": "Optimized Blog Title (max 60 chars)",
      "slug": "url-friendly-slug-based-on-title",
      "body": "The full OPTIMIZED blog post content in Markdown format. Improve grammar, structure, and readability. Ensure 'Problem-Solution' flow.",
      "excerpt": "A short summary (max 160 chars) for list views.",
      "keyTakeaways": ["Point 1", "Point 2", "Point 3"],
      "faq": [
        { "question": "Question 1", "answer": "Answer 1" },
        { "question": "Question 2", "answer": "Answer 2" }
      ],
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
      "tags": ["tag1", "tag2", "tag3"],
      "suggestedExternalLinks": [
         { "anchor": "anchor text in body", "url": "https://example.com/relevant-resource", "reason": "Reason for inclusion" }
      ],
      "suggestedInternalLinks": [
         { "anchor": "anchor text in body", "slug": "slug-of-internal-post", "reason": "Reason for inclusion" }
      ]
    }

    Optimization Guidelines:
    1. **Content Enhancement**: Fix grammar, improve flow, and ensure professional tone. Keep original meaning but make it better.
    2. **Field Completion**: Fill ALL missing fields in the JSON schema based on the content.
    3. **SEO & E-E-A-T**:
       - Integrate keywords naturally (density 3-5%).
       - Add "Key Takeaways" and "FAQ" if missing.
       - Ensure meta tags are perfect.
    4. **Linking Strategy**:
       - Suggest 2-3 high-quality EXTERNAL links (authoritative sources like Wikipedia, industry reports, official docs) relevant to the content.
       - Suggest 2-3 INTERNAL links (conceptual) - since you don't know the full site map, suggest topics/slugs that *might* exist or general pages like '/contact', '/pricing'.
    5. **Multimedia**:
       - The 'body' markdown should include existing images.
       - If existing images lack ALT text, please suggest improved ALT text in the markdown (e.g. ![Optimized Alt Text](url)).
    `;

    const userPrompt = `
    Original Title: ${title}
    Original Body: ${body}
    Target Keywords: ${Array.isArray(keywords) ? keywords.join(', ') : keywords}
    Specific Requirements: ${requirements || 'None'}
    
    Please OPTIMIZE this article now and return ONLY the JSON object.
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
        temperature: 0.5, // Lower temperature for optimization/editing
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
    const content = data.choices[0]?.message?.content || '';

    return NextResponse.json({ content });

  } catch (e) {
    console.error('AI Optimization Error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
