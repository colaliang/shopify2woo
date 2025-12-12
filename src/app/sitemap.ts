import { MetadataRoute } from 'next'
import { supportedLanguages } from '@/lib/languages'
import { client } from '@/lib/sanity'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.ydplus.net' // Replace with your actual domain

  // Fetch all blog posts
  const posts = await client.fetch(`*[_type == "post"] { 
    "slug": slug.current, 
    publishedAt,
    _updatedAt 
  }`)

  // Base routes
  const baseUrls = ['', '/blog', '/docs'];
  
  // Generate all language variants for base routes
  const routes: MetadataRoute.Sitemap = baseUrls.flatMap(path => {
    // Default URL (canonical/English)
    const defaultRoute = {
      url: `${baseUrl}${path}`,
      lastModified: new Date(),
      changeFrequency: path === '/blog' ? 'daily' : (path === '' ? 'daily' : 'weekly'),
      priority: path === '' ? 1 : (path === '/blog' ? 0.9 : 0.8),
    } as const;

    // Language variants
    const langVariants = supportedLanguages
      .filter(lang => lang !== 'en') // Skip EN as it's the default
      .map(lang => ({
        url: `${baseUrl}${path}?lng=${lang}`,
        lastModified: new Date(),
        changeFrequency: (path === '/blog' ? 'daily' : (path === '' ? 'daily' : 'weekly')) as 'daily' | 'weekly',
        priority: path === '' ? 1 : (path === '/blog' ? 0.9 : 0.8),
      }));

    return [defaultRoute, ...langVariants];
  });

  // Blog post routes with language variants
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const postRoutes: MetadataRoute.Sitemap = posts.flatMap((post: any) => {
    const lastModified = new Date(post._updatedAt || post.publishedAt || new Date());
    
    // Default post URL
    const defaultPostRoute = {
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.7,
    } as const;

    // Language variants for post
    const postLangVariants = supportedLanguages
      .filter(lang => lang !== 'en') // Skip EN as it's the default
      .map(lang => ({
        url: `${baseUrl}/blog/${post.slug}?lng=${lang}`,
        lastModified,
        changeFrequency: 'weekly',
        priority: 0.7,
      }));

    return [defaultPostRoute, ...postLangVariants];
  });

  return [...routes, ...postRoutes]
}
