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

  // Check for Chinese to Chinese translation (ZH -> ZH-HANS/ZH-HANT)
  // DeepL often fails to convert simplified <-> traditional directly, so use DeepSeek instead
  const isTargetChinese = deepLLang === 'ZH-HANS' || deepLLang === 'ZH-HANT';
  // Simple check for Chinese characters
  const isSourceChinese = /[\u4e00-\u9fa5]/.test(text);

  if (isTargetChinese && isSourceChinese) {
      try {
          // Use DeepSeek for Chinese -> Chinese translation
          const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
          if (deepSeekApiKey) {
              const response = await fetch('https://api.deepseek.com/chat/completions', {
                  method: 'POST',
                  headers: {
                      'Authorization': `Bearer ${deepSeekApiKey}`,
                      'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                      model: "deepseek-chat",
                      messages: [
                          { role: "system", content: "You are a professional translator. Translate the following text to Traditional Chinese (Taiwan). Only return the translated text." },
                          { role: "user", content: text }
                      ],
                      stream: false
                  }),
              });

              if (response.ok) {
                  const data = await response.json();
                  const translatedText = data.choices?.[0]?.message?.content?.trim();
                  if (translatedText) return translatedText;
              } else {
                  console.warn(`DeepSeek API Error: ${response.status} ${response.statusText}`);
              }
          }
      } catch (e) {
          console.warn('DeepSeek translation failed, falling back to DeepL', e);
      }
  }

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
