import { DocumentActionComponent, useDocumentOperation } from 'sanity'
import { languages, getSanityField } from '../lib/languages'
import React from 'react'

export const TranslateCategoryAction: DocumentActionComponent = (props) => {
  const { patch } = useDocumentOperation(props.id, props.type)
  const [isTranslating, setIsTranslating] = React.useState(false)

  // Only show on category documents
  if (props.type !== 'category') {
    return null
  }

  return {
    label: isTranslating ? 'Translating...' : 'Auto Translate',
    onHandle: async () => {
      setIsTranslating(true)
      const doc = props.draft || props.published
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const title = (doc?.title as any)?.en

      if (!title) {
        alert('Please enter an English title first')
        setIsTranslating(false)
        return
      }

      try {
        // Call our Next.js API route to translate
        const response = await fetch('/api/sanity/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: title,
            targetLangs: languages.filter(l => l.id !== 'en').map(l => l.id)
          })
        })

        if (!response.ok) throw new Error('Translation failed')

        const translations = await response.json()
        
        // Apply patches
        const titlePatch = {}
        Object.entries(translations).forEach(([lang, text]) => {
            // @ts-expect-error - Dynamically assigning properties to patch object
            titlePatch[`title.${getSanityField(lang)}`] = text
        })

        patch.execute([
          { set: titlePatch }
        ])
        
        // Optional: Publish after translation? No, let user review.
        
      } catch (err) {
        console.error(err)
        alert('Translation failed. Check console for details.')
      } finally {
        setIsTranslating(false)
      }
    }
  }
}
