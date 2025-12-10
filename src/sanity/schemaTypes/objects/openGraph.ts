import { defineField, defineType } from 'sanity'

export const openGraph = defineType({
  name: 'openGraph',
  title: 'Open Graph & Social Sharing',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Social Title',
      type: 'string',
      description: 'Heads up! This will override the page title for social sharing.',
    }),
    defineField({
      name: 'description',
      title: 'Social Description',
      type: 'text',
      rows: 3,
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
