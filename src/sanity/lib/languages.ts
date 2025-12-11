export const languages = [
  { id: 'en', title: 'English' },
  { id: 'zh-CN', title: 'Simplified Chinese (简体中文)' },
  { id: 'zh-TW', title: 'Traditional Chinese (繁體中文)' },
  { id: 'fr', title: 'French' },
  { id: 'de', title: 'German' },
  { id: 'es', title: 'Spanish' },
  { id: 'it', title: 'Italian' },
  { id: 'ru', title: 'Russian' },
  { id: 'pt', title: 'Portuguese' },
  { id: 'ja', title: 'Japanese' },
  { id: 'ko', title: 'Korean' },
  { id: 'ar', title: 'Arabic' },
]

export const baseLanguage = languages[0]

export function getSanityField(langId: string) {
  return langId.replace(/-/g, '_')
}
