import { defineType, defineField } from 'sanity'
import { languages } from '../../lib/languages'

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
      name: lang.id,
      title: lang.title,
      type: 'string',
      fieldset: lang.id === 'en' ? undefined : 'translations',
    })
  ),
})
