import { MetadataRoute } from 'next'
import { supportedLanguages } from '@/lib/i18n'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.ydplus.net' // Replace with your actual domain

  // Base routes
  const routes = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
  ]

  // Add language variants for the home page using query params
  // Since we use client-side routing with query string detection (?lng=...), 
  // we can list them here to help search engines discover them.
  // Note: Standard practice usually prefers path-based routing (/en, /fr), 
  // but query params are also supported by Google if content varies.
  const langRoutes = supportedLanguages.map(lang => ({
    url: `${baseUrl}/?lng=${lang}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }))

  return [...routes, ...langRoutes]
}
