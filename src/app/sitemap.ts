import { MetadataRoute } from 'next'
import { supportedLanguages } from '@/lib/languages'
import { client } from '@/lib/sanity'

// Manually list supported languages to avoid importing from @/lib/i18n
// Importing from @/lib/i18n causes issues during build because it initializes i18next instance
// which might try to use browser APIs or have side effects incompatible with sitemap generation context
// const supportedLanguages = [
//   'en', 'fr', 'de', 'es', 'it', 'ru', 'pt', 'zh-CN', 'zh-TW', 'ja', 'ko'
// ];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.ydplus.net' // Replace with your actual domain

  // Fetch all blog posts
  const posts = await client.fetch(`*[_type == "post"] { 
    "slug": slug.current, 
    publishedAt,
    _updatedAt 
  }`)

  // Base routes
  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]

  // Add language variants for the home page using query params
  // Since we use client-side routing with query string detection (?lng=...), 
  // we can list them here to help search engines discover them.
  // Note: Standard practice usually prefers path-based routing (/en, /fr), 
  // but query params are also supported by Google if content varies.
  const langRoutes: MetadataRoute.Sitemap = supportedLanguages.map(lang => ({
    url: `${baseUrl}/?lng=${lang}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.9,
  }))

  // Blog post routes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const postRoutes: MetadataRoute.Sitemap = posts.map((post: any) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post._updatedAt || post.publishedAt || new Date()),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...routes, ...langRoutes, ...postRoutes]
}
