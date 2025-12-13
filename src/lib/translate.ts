// DeepL API call
export async function translateText(text: string, targetLang: string) {
  const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
  if (!DEEPL_API_KEY) throw new Error('DeepL API Key is not configured');
  const DEEPL_API_URL = DEEPL_API_KEY.endsWith(':fx') 
    ? 'https://api-free.deepl.com/v2/translate' 
    : 'https://api.deepl.com/v2/translate';

  if (!text) return '';

  // Map language codes
  let deepLLang = targetLang.toUpperCase();
  if (deepLLang === 'EN') deepLLang = 'EN-US';
  if (deepLLang === 'ZH-CN') deepLLang = 'ZH-HANS';
  if (deepLLang === 'ZH-TW') deepLLang = 'ZH-HANT';
  if (deepLLang === 'PT') deepLLang = 'PT-PT';
  // Add other mappings if needed

  try {
    const response = await fetch(DEEPL_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: [text],
            target_lang: deepLLang,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepL API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.translations?.[0]?.text || text;

  } catch (e) {
      console.error(`Translation failed for ${targetLang}:`, e);
      throw e;
  }
}
