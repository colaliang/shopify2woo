import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export const runtime = 'edge'; // Use Edge Runtime for streaming

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
    - Format: Return valid HTML (e.g., <h1>, <p>, <ul>, <li>) suitable for a WYSIWYG editor. DO NOT wrap in markdown code blocks like \`\`\`html. Just return the raw HTML string.
    `;

    const userPrompt = `
    Blog Title: ${title}
    Target Keywords: ${Array.isArray(keywords) ? keywords.join(', ') : keywords}
    Specific Requirements: ${requirements || 'None'}
    
    Please write the article now.
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
        stream: true, // Enable streaming
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Deepseek API Error:', errorText);
        return NextResponse.json({ error: `Deepseek API Error: ${response.statusText}` }, { status: response.status });
    }

    // 5. Proxy the stream
    // We use a TransformStream to pass the chunks directly to the client
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
        async start(controller) {
            const reader = response.body?.getReader();
            if (!reader) {
                controller.close();
                return;
            }

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    // Parse SSE format: data: {...}
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                            try {
                                const data = JSON.parse(line.slice(6));
                                const content = data.choices[0]?.delta?.content || '';
                                if (content) {
                                    controller.enqueue(encoder.encode(content));
                                }
                            } catch {
                                // Ignore parse errors for partial chunks
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Stream reading error', e);
                controller.error(e);
            } finally {
                controller.close();
            }
        }
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
        },
    });

  } catch (e) {
    console.error('AI Generation Error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
