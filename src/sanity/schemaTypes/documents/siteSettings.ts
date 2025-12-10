import { defineField, defineType } from 'sanity'

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Site Title',
      type: 'string',
    }),
    defineField({
      name: 'description',
      title: 'Site Description',
      type: 'text',
    }),
    defineField({
      name: 'keywords',
      title: 'Site Keywords',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Global keywords for the site (meta keywords)',
    }),
    
    // Global SEO
    defineField({
        name: 'defaultSeo',
        title: 'Default SEO',
        type: 'seo',
        description: 'Fallback SEO settings for pages without specific configuration.',
    }),

    // Baidu Specifics
    defineField({
      name: 'baiduVerification',
      title: 'Baidu Site Verification Code',
      type: 'string',
      description: 'The verification string from Baidu Webmaster Tools.',
    }),
    defineField({
        name: 'enableBaiduPush',
        title: 'Enable Baidu Link Push',
        type: 'boolean',
        description: 'Automatically push new links to Baidu via API.',
        initialValue: false,
    }),
    defineField({
        name: 'baiduPushToken',
        title: 'Baidu Push Token',
        type: 'string',
        hidden: ({parent}) => !parent?.enableBaiduPush,
    }),

    // Google Specifics
    defineField({
      name: 'googleVerification',
      title: 'Google Site Verification Code',
      type: 'string',
    }),
    defineField({
        name: 'googleAnalyticsId',
        title: 'Google Analytics ID (GA4)',
        type: 'string',
        placeholder: 'G-XXXXXXXXXX'
    }),
  ],
})
