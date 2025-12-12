// Real Deepseek API call
export async function callDeepseek(text: string, targetLang: string) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  // Map our language codes to standard ones if necessary
  // Deepseek generally understands standard codes like zh-CN, fr, etc.
  const prompt = `Translate the following text to ${targetLang}. Only return the translated text, no explanations or quotes.
Text: ${text}`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are a helpful translation assistant." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Deepseek API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('No content in Deepseek response');
  }

  return content.trim();
}
