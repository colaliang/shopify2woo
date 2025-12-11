import { defineField, defineType } from 'sanity'
import { languages } from '../../lib/languages'

export const post = defineType({
  name: 'post',
  title: 'Blog Post',
  type: 'document',
  groups: [
    { name: 'content', title: 'Content', default: true },
    { name: 'seo', title: 'SEO & Social' },
    { name: 'settings', title: 'Settings' },
  ],
  fields: [
    defineField({
      name: 'translationId',
      title: 'Translation ID',
      type: 'string',
      description: 'Used to group translations of the same document',
      hidden: true, // Hidden because it should be managed by system/plugins usually, or revealed if manual entry needed
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      group: 'content',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'content',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'mainImage',
      title: 'Main image',
      type: 'image',
      group: 'content',
      options: {
        hotspot: true,
      },
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alternative Text',
          description: 'Important for SEO and accessiblity.',
          validation: (Rule) => Rule.required(),
        },
        {
            name: 'lazyLoad',
            type: 'boolean',
            title: 'Lazy Load',
            description: 'Should this image be lazy loaded?',
            initialValue: true,
        }
      ],
    }),
    defineField({
      name: 'bodyMarkdown',
      title: 'Body (Markdown)',
      type: 'markdown',
      group: 'content',
      description: 'Markdown content. This is the primary storage format for blog posts.',
    }),
    defineField({
      name: 'bodyHtml',
      title: 'Body (HTML)',
      type: 'text',
      group: 'content',
      description: 'DEPRECATED: Raw HTML content from old editor. Will be converted to Markdown.',
      hidden: true,
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      group: 'content',
      of: [
        {
          type: 'block',
          styles: [
            { title: 'Normal', value: 'normal' },
            { title: 'H1', value: 'h1' },
            { title: 'H2', value: 'h2' },
            { title: 'H3', value: 'h3' },
            { title: 'H4', value: 'h4' },
            { title: 'H5', value: 'h5' },
            { title: 'H6', value: 'h6' },
            { title: 'Quote', value: 'blockquote' },
          ],
        },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
             {
               name: 'alt',
               type: 'string',
               title: 'Alternative Text',
               validation: (Rule) => Rule.required(),
             }
          ]
        },
      ],
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 4,
      group: 'content',
      description: 'Short summary for list views and SEO fallback.',
    }),
    
    // SEO & Social Fields
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
      group: 'seo',
    }),
    defineField({
      name: 'openGraph',
      title: 'Open Graph',
      type: 'openGraph',
      group: 'seo',
    }),
    
    // Structured Data / Schema.org
    defineField({
      name: 'schemaType',
      title: 'Schema.org Type',
      type: 'string',
      group: 'seo',
      options: {
        list: [
          { title: 'Article', value: 'Article' },
          { title: 'NewsArticle', value: 'NewsArticle' },
          { title: 'BlogPosting', value: 'BlogPosting' },
        ],
      },
      initialValue: 'BlogPosting',
    }),
    defineField({
      name: 'faq',
      title: 'FAQ Schema',
      type: 'array',
      group: 'seo',
      description: 'Frequently Asked Questions for Schema.org markup',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'question', type: 'string', title: 'Question' },
            { name: 'answer', type: 'text', title: 'Answer' }
          ]
        }
      ]
    }),
    defineField({
      name: 'keyTakeaways',
      title: 'Key Takeaways (TL;DR)',
      type: 'array',
      group: 'content',
      description: 'Summary points for the top of the article',
      of: [{ type: 'string' }]
    }),

    // Internal Linking / Quality
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      group: 'content',
      description: 'Select categories for this post. Categories are multilingual.',
      of: [{ 
        type: 'reference', 
        to: { type: 'category' },
        // Since Category is now a single document with multilingual fields, we don't need to filter by language ID.
        // However, we can display the title in the correct language in the Studio based on some logic if possible,
        // but standard Sanity reference search searches on the preview title (which is usually English).
      }],
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      group: 'content',
      of: [{ type: 'string' }],
      options: {
        layout: 'tags'
      }
    }),
    defineField({
      name: 'relatedPosts',
      title: 'Related Posts',
      type: 'array',
      group: 'content',
      description: 'Manually select related posts to improve internal linking structure.',
      of: [{ type: 'reference', to: { type: 'post' } }],
    }),

    // Settings
    defineField({
        name: 'publishedAt',
        title: 'Published at',
        type: 'datetime',
        group: 'settings',
    }),
    defineField({
        name: 'language',
        title: 'Language',
        type: 'string',
        group: 'settings',
        options: {
            list: languages.map((lang) => ({ title: lang.title, value: lang.id })),
        },
        initialValue: 'en',
    })
  ],
  preview: {
    select: {
      title: 'title',
      author: 'author.name',
      media: 'mainImage',
    },
    prepare(selection) {
      const { author } = selection
      return { ...selection, subtitle: author && `by ${author}` }
    },
  },
})
