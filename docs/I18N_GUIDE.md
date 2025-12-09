# Internationalization (i18n) Guide

This project uses `i18next` and `react-i18next` for internationalization support.

## Architecture

- **Library**: `i18next`, `react-i18next`
- **Backend**: `i18next-http-backend` (loads translations from `public/locales`)
- **Detection**: `i18next-browser-languagedetector` (detects user language)
- **State Management**: React Context (`I18nProvider`)

## Directory Structure

```
public/
  locales/
    en/
      translation.json
    zh-CN/
      translation.json
    ... (other languages)
src/
  lib/
    i18n.ts          # Configuration
  components/
    providers/
      I18nProvider.tsx # Context Provider
    LanguageSwitcher.tsx # UI Component
```

## Supported Languages

Currently supported languages:
- English (en)
- French (fr)
- German (de)
- Spanish (es)
- Italian (it)
- Russian (ru)
- Portuguese (pt)
- Simplified Chinese (zh-CN)
- Traditional Chinese (zh-TW)
- Japanese (ja)
- Korean (ko)

## How to Add a New Language

1.  **Create Resource File**:
    Create a new folder in `public/locales/{lang_code}` and add `translation.json`.
    Ensure the JSON structure matches the reference (e.g., `en/translation.json`).

2.  **Register Language**:
    Update `src/lib/i18n.ts`:
    ```typescript
    export const supportedLanguages = [
      // ... existing
      'new_lang_code'
    ];
    ```

3.  **Update UI**:
    Update `src/components/LanguageSwitcher.tsx`:
    ```typescript
    const languageNames = {
      // ... existing
      'new_lang_code': 'Language Name'
    };
    ```

## Usage in Components

Use the `useTranslation` hook:

```tsx
import { useTranslation } from 'react-i18next';

export default function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('key.path')}</h1>
      <p>{t('welcome_user', { name: 'John' })}</p>
    </div>
  );
}
```

## Key Naming Convention

- Use nested keys for grouping (e.g., `nav.home`, `settings.profile`).
- Use lowercase and underscores for keys (e.g., `product_import`).
- Maintain consistent keys across all language files.

## Testing

- Verify language detection by changing browser settings.
- Verify persistence by refreshing the page (saved in `localStorage` key `i18nextLng`).
- Check RTL support for languages like Arabic or Hebrew (if added).

## Performance

- Translation files are lazy-loaded via HTTP requests only when needed.
- `localStorage` is used to cache the user's preference.
