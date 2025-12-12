import { defineType, defineField } from 'sanity'
import { languages, getSanityField } from '../../lib/languages'

export const localizedText = defineType({
  name: 'localizedText',
  title: 'Localized Text',
  type: 'object',
  fieldsets: [
    {
      title: 'Translations',
      name: 'translations',
      options: { collapsible: true, collapsed: false }
    }
  ],
  fields: languages.map((lang) => 
    defineField({
      name: getSanityField(lang.id),
      title: lang.title,
      type: 'text',
      rows: 4,
      fieldset: lang.id === 'en' ? undefined : 'translations',
    })
  ),
})
