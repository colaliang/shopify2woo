import { defineField, defineType } from 'sanity'

export const seo = defineType({
  name: 'seo',
  title: 'SEO & Metadata',
  type: 'object',
  fields: [
    defineField({
      name: 'metaTitle',
      title: 'Meta Title (Legacy)',
      type: 'string',
      hidden: true,
    }),
    defineField({
      name: 'metaTitleLocalized',
      title: 'Meta Title',
      type: 'localizedString',
      description: 'Title used for search engines and browser tabs. Keep it under 60 characters for best results.',
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta Description (Legacy)',
      type: 'text',
      hidden: true,
    }),
    defineField({
      name: 'metaDescriptionLocalized',
      title: 'Meta Description',
      type: 'localizedText',
      description: 'Description for search engines. Keep it under 160 characters.',
    }),
    defineField({
      name: 'canonicalUrl',
      title: 'Canonical URL',
      type: 'url',
      description: 'The preferred URL for this content, helps prevent duplicate content issues.',
    }),
    defineField({
      name: 'focusKeyword',
      title: 'Focus Keyword',
      type: 'string',
      description: 'Main keyword for this content. Used for internal tracking and analysis.',
    }),
    defineField({
      name: 'keywords',
      title: 'Keywords (Meta Keywords)',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Legacy support for Baidu/Bing. Google ignores this.',
    }),
    defineField({
      name: 'noIndex',
      title: 'No Index',
      type: 'boolean',
      description: 'Hide this page from search engines',
      initialValue: false,
    }),
    defineField({
      name: 'noFollow',
      title: 'No Follow',
      type: 'boolean',
      description: 'Do not follow links on this page',
      initialValue: false,
    }),
    defineField({
      name: 'hreflangs',
      title: 'Hreflang Tags',
      description: 'For multi-language sites. Map language codes to URLs.',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'language', type: 'string', title: 'Language Code (e.g., en-US, zh-CN)' },
            { name: 'url', type: 'url', title: 'URL' },
          ],
        },
      ],
    }),
  ],
})
