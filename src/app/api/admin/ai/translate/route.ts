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

async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
    if (texts.length === 0) return [];

    // DeepL limits: 50 texts per request, 128KB total request size.
    const BATCH_SIZE = 50;
    const MAX_PAYLOAD_SIZE = 100 * 1024; // 100KB safety margin

    const results: string[] = new Array(texts.length).fill('');
    
    let currentBatch: { text: string, index: number }[] = [];
    let currentBatchSize = 0;

    const processBatch = async (batch: { text: string, index: number }[]) => {
        if (batch.length === 0) return;
        
        try {
            const response = await fetch(DEEPL_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: batch.map(b => b.text),
                    target_lang: targetLang,
                    // tag_handling: 'xml' // Optional: if we want to protect tags more strictly
                }),
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
        const { content, targetLangs } = await req.json(); // sourceLang is optional for DeepL

        if (!content) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        // 2. Flatten Content
        const { texts, map } = flattenContent(content);
        
        console.log(`Translating ${texts.length} segments to ${targetLangs.length} languages.`);

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
                const translatedTexts = await translateBatch(texts, deepLLang);
                translations[lang] = reconstructContent(content, translatedTexts, map);
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
