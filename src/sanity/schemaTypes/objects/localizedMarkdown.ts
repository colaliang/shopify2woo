import { defineType, defineField } from 'sanity'
import { languages, getSanityField } from '../../lib/languages'

export const localizedMarkdown = defineType({
  name: 'localizedMarkdown',
  title: 'Localized Markdown',
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
      type: 'markdown', // Assuming 'markdown' plugin is installed/configured
      fieldset: lang.id === 'en' ? undefined : 'translations',
    })
  ),
})
