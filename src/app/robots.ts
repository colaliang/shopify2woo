import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.ydplus.net' // Replace with your actual domain

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/docs/'],
      disallow: ['/admin/', '/api/', '/debug/', '/test/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
