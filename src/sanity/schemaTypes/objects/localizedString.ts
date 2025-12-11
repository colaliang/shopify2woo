import { defineType, defineField } from 'sanity'
import { languages, getSanityField } from '../../lib/languages'

export const localizedString = defineType({
  name: 'localizedString',
  title: 'Localized String',
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
      type: 'string',
      fieldset: lang.id === 'en' ? undefined : 'translations',
    })
  ),
})
