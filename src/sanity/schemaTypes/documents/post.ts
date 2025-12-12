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
      title: 'Title (Legacy)',
      type: 'string',
      group: 'content',
      hidden: true, // Hide legacy field
    }),
    defineField({
      name: 'localizedTitle',
      title: 'Title',
      type: 'localizedString',
      group: 'content',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'content',
      options: {
        source: 'localizedTitle.en', // Use English title for slug generation
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'mainImage',
      title: 'Main image (Legacy)',
      type: 'image',
      group: 'content',
      options: {
        hotspot: true,
      },
      hidden: true,
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alternative Text (Legacy)',
          hidden: true,
        },
        {
          name: 'localizedAlt',
          type: 'localizedString',
          title: 'Alternative Text',
        },
      ],
    }),
    defineField({
      name: 'localizedMainImage',
      title: 'Main image',
      type: 'object',
      group: 'content',
      description: 'Localized cover images. Fallback to English if missing.',
      fields: languages.map((lang) => 
        defineField({
          name: lang.id.replace(/-/g, '_'),
          title: lang.title,
          type: 'image',
          options: { hotspot: true },
          fields: [
            {
              name: 'alt',
              type: 'string',
              title: 'Alternative Text',
            }
          ]
        })
      )
    }),
    defineField({
      name: 'bodyMarkdown',
      title: 'Body (Markdown Legacy)',
      type: 'markdown',
      group: 'content',
      hidden: true,
    }),
    defineField({
      name: 'localizedBodyMarkdown',
      title: 'Body (Markdown)',
      type: 'localizedMarkdown',
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
      title: 'Excerpt (Legacy)',
      type: 'text',
      rows: 4,
      group: 'content',
      hidden: true,
    }),
    defineField({
      name: 'localizedExcerpt',
      title: 'Excerpt',
      type: 'localizedText',
      group: 'content',
      description: 'Short summary for list views and SEO fallback.',
    }),
    
    defineField({
      name: 'localizedKeywords',
      title: 'Keywords (Localized)',
      type: 'object',
      group: 'seo',
      fields: languages.map((lang) => 
        defineField({
          name: lang.id.replace(/-/g, '_'),
          title: lang.title,
          type: 'array',
          of: [{ type: 'string' }]
        })
      )
    }),
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
      name: 'localizedKeyTakeaways',
      title: 'Key Takeaways (Localized)',
      type: 'object',
      group: 'content',
      fields: languages.map((lang) => 
        defineField({
          name: lang.id.replace(/-/g, '_'),
          title: lang.title,
          type: 'array',
          of: [{ type: 'string' }]
        })
      )
    }),
    defineField({
      name: 'localizedFaq',
      title: 'FAQ Schema (Localized)',
      type: 'object',
      group: 'seo',
      fields: languages.map((lang) => 
        defineField({
          name: lang.id.replace(/-/g, '_'),
          title: lang.title,
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                { name: 'question', type: 'string', title: 'Question' },
                { name: 'answer', type: 'text', title: 'Answer' }
              ]
            }
          ]
        })
      )
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
    // We remove the explicit language field as it is now field-level localized
    // However, for compatibility or legacy data, we might want to keep it or mark it deprecated.
    // The user requested "Default language set to English", which is handled by field-level defaults or UI.
    // defineField({
    //     name: 'language',
    //     title: 'Language',
    //     type: 'string',
    //     hidden: true,
    // })
  ],
    preview: {
    select: {
      title: 'localizedTitle.en',
      legacyTitle: 'title',
      localizedTitle: 'localizedTitle',
      // media: 'mainImage', // legacy
      media: 'localizedMainImage.en', // new default
    },
    prepare(selection) {
      const { title, legacyTitle, localizedTitle, media } = selection
      const displayTitle = title || legacyTitle || 'Untitled'
      
      // Calculate available languages
      const langs = localizedTitle 
        ? Object.keys(localizedTitle).filter(k => k !== '_type').map(k => k.replace('_', '-').toUpperCase()) 
        : []
      
      return { 
        title: displayTitle, 
        subtitle: langs.length > 0 ? `Available in: ${langs.join(', ')}` : 'No translations',
        media
      }
    },
  },
})
