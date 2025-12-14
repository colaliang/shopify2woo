import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';

// DeepL API Configuration
const DEEPL_API_KEY = process.env.DEEPL_API_KEY || '';
const DEEPL_API_URL = DEEPL_API_KEY.endsWith(':fx') 
    ? 'https://api-free.deepl.com/v2/translate' 
    : 'https://api.deepl.com/v2/translate';

// Helper to flatten the content object into an array of strings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenContent(content: any): { texts: string[], map: any[] } {
    const texts: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map: any[] = [];

    const addText = (text: string, path: (string | number)[]) => {
        // Only translate non-empty strings
        if (text && typeof text === 'string' && text.trim().length > 0) {
            texts.push(text);
            map.push({ path, index: texts.length - 1 });
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traverse = (obj: any, currentPath: (string | number)[]) => {
        if (typeof obj === 'string') {
            addText(obj, currentPath);
        } else if (Array.isArray(obj)) {
            obj.forEach((item, i) => traverse(item, [...currentPath, i]));
        } else if (obj && typeof obj === 'object') {
            Object.keys(obj).forEach(key => traverse(obj[key], [...currentPath, key]));
        }
    };

    traverse(content, []);
    return { texts, map };
}

// Helper to reconstruct the content object from translated texts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reconstructContent(originalContent: any, translations: string[], map: any[]) {
    // Deep clone original content to preserve structure and non-translated fields
    const newContent = JSON.parse(JSON.stringify(originalContent));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.forEach(({ path, index }: any) => {
        const translatedText = translations[index];
        // Only update if we have a valid translation
        if (translatedText !== undefined && translatedText !== null) {
            let current = newContent;
            for (let i = 0; i < path.length - 1; i++) {
                current = current[path[i]];
            }
            current[path[path.length - 1]] = translatedText;
        }
    });

    return newContent;
}

// Helper to translate batch with DeepSeek
async function translateBatchWithDeepSeek(texts: string[], _targetLang: string): Promise<string[]> {
    const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
    if (!deepSeekApiKey) throw new Error('DeepSeek API Key not configured');

    const results: string[] = [];
    
    // Process in smaller batches for DeepSeek to avoid context limits and ensure reliability
    const BATCH_SIZE = 10; 
    
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        
        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${deepSeekApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        { 
                            role: "system", 
                            content: `You are a professional translator. Translate the following array of texts to Traditional Chinese (Taiwan). 
                            Return ONLY a JSON array of strings, ensuring the order matches the input. 
                            Do not include any other text or markdown formatting. 
                            Example input: ["你好", "世界"] 
                            Example output: ["你好", "世界"]` 
                        },
                        { role: "user", content: JSON.stringify(batch) }
                    ],
                    stream: false,
                    temperature: 0.1
                }),
            });

            if (!response.ok) {
                throw new Error(`DeepSeek API Error: ${response.status}`);
            }

            const data = await response.json();
            let content = data.choices?.[0]?.message?.content?.trim();
            
            // Remove markdown code blocks if present
            if (content.startsWith('```json')) {
                content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (content.startsWith('```')) {
                content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            const translatedBatch = JSON.parse(content);
            if (Array.isArray(translatedBatch)) {
                results.push(...translatedBatch);
            } else {
                 // Fallback if not array
                 console.error('DeepSeek returned non-array:', content);
                 results.push(...batch); // Keep original as fallback
            }

        } catch (e) {
            console.error('DeepSeek batch translation failed', e);
            results.push(...batch); // Keep original as fallback
        }
    }
    
    // Pad if results length mismatch (shouldn't happen if logic is correct but safety first)
    while (results.length < texts.length) {
        results.push(texts[results.length]);
    }
    
    return results;
}

async function translateBatch(texts: string[], targetLang: string, sourceLang?: string): Promise<string[]> {
    if (texts.length === 0) return [];

    // DeepL limits: 50 texts per request, 128KB total request size.
    const BATCH_SIZE = 50;
    const MAX_PAYLOAD_SIZE = 100 * 1024; // 100KB safety margin

    const results: string[] = new Array(texts.length).fill('');
    
    let currentBatch: { text: string, index: number }[] = [];
    let currentBatchSize = 0;

    const processBatch = async (batch: { text: string, index: number }[]) => {
        if (batch.length === 0) return;
        
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEV] Processing batch of ${batch.length} segments for ${targetLang}. Total chars: ${batch.reduce((acc, b) => acc + b.text.length, 0)}`);
        }

        try {
            const body: { text: string[], target_lang: string, source_lang?: string } = {
                text: batch.map(b => b.text),
                target_lang: targetLang,
            };

            if (sourceLang) {
                // Map source lang if needed
                let sLang = sourceLang.toUpperCase();
                if (sLang === 'EN') sLang = 'EN'; // DeepL uses EN for source, but EN-US/EN-GB for target. EN is fine.
                // DeepL source_lang doesn't support EN-US/EN-GB, just EN.
                // We might need to map 'zh-CN' -> 'ZH' or leave it for auto-detect if unsure.
                // DeepL supports ZH.
                if (sLang === 'ZH-CN' || sLang === 'ZH-TW') sLang = 'ZH';
                if (sLang === 'PT-PT' || sLang === 'PT-BR') sLang = 'PT';
                
                body.source_lang = sLang;
            }

            if (process.env.NODE_ENV === 'development') {
                console.log(`[DEV] DeepL Request Body for ${targetLang}:`, JSON.stringify(body, null, 2));
            }

            const response = await fetch(DEEPL_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`DeepL API Error (${targetLang}):`, errText);
                throw new Error(`DeepL API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.translations && Array.isArray(data.translations)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.translations.forEach((t: any, i: number) => {
                    results[batch[i].index] = t.text;
                });
            }
        } catch (e) {
            console.error(`Translation batch failed for ${targetLang}`, e);
            throw e;
        }
    };

    for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        const textSize = Buffer.byteLength(text, 'utf8');

        // Check limits
        if (currentBatch.length >= BATCH_SIZE || (currentBatchSize + textSize) > MAX_PAYLOAD_SIZE) {
            await processBatch(currentBatch);
            currentBatch = [];
            currentBatchSize = 0;
        }

        currentBatch.push({ text, index: i });
        currentBatchSize += textSize;
    }

    if (currentBatch.length > 0) {
        await processBatch(currentBatch);
    }

    return results;
}

export async function POST(req: Request) {
    const startTime = Date.now();
    
    // 1. Check Auth
    const { error, status } = await checkAdmin();
    if (error) return NextResponse.json({ error }, { status });

    if (!DEEPL_API_KEY) {
         return NextResponse.json({ error: 'DeepL API key not configured.' }, { status: 500 });
    }

    try {
        const { content, targetLangs, sourceLang } = await req.json();

        if (!content) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        // 2. Flatten Content
        const { texts, map } = flattenContent(content);
        
        console.log(`Translating ${texts.length} segments to ${targetLangs.length} languages (Source: ${sourceLang || 'Auto'}).`);

        if (process.env.NODE_ENV === 'development') {
            const totalLength = texts.reduce((acc, t) => acc + t.length, 0);
            console.log(`[DEV] Total characters to translate: ${totalLength}`);
            console.log(`[DEV] Segments preview (first 5):`, texts.slice(0, 5));
            if (texts.length > 20) {
                 console.log(`[DEV] ... and ${texts.length - 5} more segments.`);
            }
        }

        if (texts.length === 0) {
             return NextResponse.json({ translations: {} });
        }

        // 3. Translate for each target language
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const translations: Record<string, any> = {};
        
        await Promise.all(targetLangs.map(async (lang: string) => {
            // Map common language codes to DeepL codes
            let deepLLang = lang.toUpperCase();
            
            // Handle specific mappings
            if (deepLLang === 'EN') deepLLang = 'EN-US';
            if (deepLLang === 'ZH-CN') deepLLang = 'ZH-HANS';
            if (deepLLang === 'ZH-TW') deepLLang = 'ZH-HANT';
            if (deepLLang === 'PT') deepLLang = 'PT-PT';
            
            try {
                // Check if we should use DeepSeek for Chinese -> Chinese translation
                // Trigger only if target is Traditional Chinese (ZH-HANT/ZH-TW) 
                // and source is explicitly Simplified Chinese (ZH-CN) or we detect Chinese content
                const isTargetTradChinese = deepLLang === 'ZH-HANT';
                // Note: DeepL maps ZH-TW to ZH-HANT in our logic above
                
                let shouldUseDeepSeek = false;
                
                if (isTargetTradChinese) {
                    // Check source lang
                    if (sourceLang && (sourceLang.toUpperCase() === 'ZH-CN' || sourceLang.toUpperCase() === 'ZH')) {
                        shouldUseDeepSeek = true;
                    } else if (!sourceLang) {
                        // If no source lang, check if content looks like Chinese
                        // Sample first few texts
                        const sampleText = texts.slice(0, 5).join('');
                        if (/[\u4e00-\u9fa5]/.test(sampleText)) {
                            shouldUseDeepSeek = true;
                        }
                    }
                }

                if (shouldUseDeepSeek && process.env.DEEPSEEK_API_KEY) {
                     if (process.env.NODE_ENV === 'development') {
                         console.log(`[Translate] Using DeepSeek for ${lang} (ZH->ZH-TW) translation.`);
                     }
                     const translatedTexts = await translateBatchWithDeepSeek(texts, lang);
                     translations[lang] = reconstructContent(content, translatedTexts, map);
                } else {
                    const translatedTexts = await translateBatch(texts, deepLLang, sourceLang);
                    translations[lang] = reconstructContent(content, translatedTexts, map);
                }
            } catch (e) {
                console.error(`Failed to translate to ${lang}`, e);
                // Return null or partial error for this lang?
                // We'll just omit it from the result, client will handle it.
            }
        }));

        const duration = Date.now() - startTime;
        console.log(`Translation completed in ${duration}ms.`);

        return NextResponse.json({ translations });

    } catch (e) {
        console.error('Translation Error:', e);
        return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
