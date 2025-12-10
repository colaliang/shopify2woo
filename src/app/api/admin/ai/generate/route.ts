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
    - Length: 800-1500 words
    - Structure: Use H1 for main title, H2/H3 for subsections. Use bullet points and lists where appropriate.
    - SEO: Naturally integrate keywords (density 3-5%). Include a meta description at the very beginning (labeled as [Meta Description]).
    - Layout & Beautification:
      - Use responsive Markdown tables where appropriate for comparisons.
      - Use proper spacing and clear formatting.
      - Ensure the output looks professional.
    - Format: Return valid Markdown (e.g., #, ##, -, *, | table |) suitable for a Markdown editor. DO NOT wrap in markdown code blocks like \`\`\`markdown. Just return the raw Markdown string.
    `;

    const userPrompt = `
    Blog Title: ${title}
    Target Keywords: ${Array.isArray(keywords) ? keywords.join(', ') : keywords}
    Specific Requirements: ${requirements || 'None'}
    
    Please write the article now.
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
        max_tokens: 2000,
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
