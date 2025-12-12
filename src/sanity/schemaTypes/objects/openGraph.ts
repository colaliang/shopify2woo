import { defineField, defineType } from 'sanity'

export const openGraph = defineType({
  name: 'openGraph',
  title: 'Open Graph & Social Sharing',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Social Title (Legacy)',
      type: 'string',
      hidden: true,
    }),
    defineField({
      name: 'titleLocalized',
      title: 'Social Title',
      type: 'localizedString',
      description: 'Heads up! This will override the page title for social sharing.',
    }),
    defineField({
      name: 'description',
      title: 'Social Description (Legacy)',
      type: 'text',
      hidden: true,
    }),
    defineField({
      name: 'descriptionLocalized',
      title: 'Social Description',
      type: 'localizedText',
      description: 'Heads up! This will override the page description for social sharing.',
    }),
    defineField({
      name: 'image',
      title: 'Social Image',
      type: 'image',
      description: 'Image for social sharing (Facebook, Twitter, LinkedIn, etc.)',
      options: {
        hotspot: true,
      },
      fields: [
        defineField({
          name: 'alt',
          title: 'Alternative Text',
          type: 'string',
          description: 'Important for SEO and accessibility.',
          validation: (Rule) => Rule.required(),
        }),
      ],
    }),
  ],
})
