import { client, urlFor } from '@/lib/sanity'
import { getLocalizedTitle } from '@/sanity/lib/languages'
import BlogHeader from '../components/BlogHeader'
import BlogPostContent from './components/BlogPostContent'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ReadingProgress from './components/ReadingProgress'

// Simplified type definition to avoid import errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SanityImageSource = any

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
  interface Post {
  _id: string
  title: string
  slug: { current: string }
  mainImage: SanityImageSource
  publishedAt: string
  language?: string
  bodyHtml?: string
  bodyMarkdown?: string
  body?: unknown[]
  excerpt?: string
  categories: { title: string; slug: { current: string } }[]
  keyTakeaways?: string[]
  faq?: { question: string; answer: string }[]
  seo?: {
      metaTitle?: string
      metaDescription?: string
      noIndex?: boolean
      schemaType?: string
  }
}

// -----------------------------------------------------------------------------
// Data Fetching
// -----------------------------------------------------------------------------
async function getPost(slug: string): Promise<Post | null> {
  const postData = await client.fetch(`*[_type == "post" && slug.current == $slug][0] {
    ...,
    "author": author->name,
    "categories": categories[]->{
      title,
      slug
    },
    "relatedPosts": relatedPosts[]->{
      title,
      slug,
      publishedAt,
      mainImage,
      "categories": categories[]->{
        title,
        slug
      }
    }
  }`, { slug }, { next: { revalidate: 0 } })

  if (!postData) {
    return null
  }

  // Localize categories for the main post
  const language = postData.language || 'en'
  const localizedPost = {
      ...postData,
      title: getLocalizedTitle(postData.title, language),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categories: postData.categories?.map((c: any) => ({
          ...c,
          // If title is an object (localizedString), extract string. If it's already a string, use it.
          title: getLocalizedTitle(c.title, language)
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      relatedPosts: postData.relatedPosts?.map((rp: any) => ({
          ...rp,
          title: getLocalizedTitle(rp.title, language),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categories: rp.categories?.map((c: any) => ({
              ...c,
              title: getLocalizedTitle(c.title, language)
          }))
      }))
  }

  return localizedPost
}

async function getRecentPosts(language?: string) {
  let conditions = `_type == "post" && defined(slug.current)`
  const params: Record<string, string> = {}

  if (language) {
    if (language === 'en') {
      conditions += ` && (language == $language || !defined(language) || language == "" || language == "EN")`
    } else {
      conditions += ` && language == $language`
    }
    params.language = language
  }

  const postsData = await client.fetch(`*[${conditions}] | order(publishedAt desc) [0...5] {
    _id,
    title,
    slug,
    publishedAt,
    mainImage
  }`, params)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return postsData?.map((p: any) => ({
      ...p,
      title: getLocalizedTitle(p.title, language || 'en')
  })) || []
}

async function getCategories(language: string = 'en') {
  const categories = await client.fetch(`*[_type == "category"] | order(title asc) {
    _id,
    title,
    slug
  }`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return categories?.map((c: any) => ({
      ...c,
      title: getLocalizedTitle(c.title, language)
  })) || []
}

// -----------------------------------------------------------------------------
// Metadata
// -----------------------------------------------------------------------------
export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params
  const post = await getPost(params.slug)
  
  if (!post) {
      return {
          title: 'Post Not Found',
      }
  }

  return {
    title: post.seo?.metaTitle || post.title,
    description: post.seo?.metaDescription || post.excerpt,
    robots: post.seo?.noIndex ? 'noindex, nofollow' : 'index, follow',
    openGraph: {
        title: post.seo?.metaTitle || post.title,
        description: post.seo?.metaDescription || post.excerpt,
        type: 'article',
        publishedTime: post.publishedAt,
        images: post.mainImage ? [urlFor(post.mainImage).width(1200).height(630).url()] : [],
    }
  }
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export default async function BlogPostPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const post = await getPost(params.slug)

  if (!post) {
    notFound()
  }

  // Determine language from post data
  const language = (post.language as string) || 'en'

  const [recentPosts, categories] = await Promise.all([
    getRecentPosts(language),
    getCategories(language)
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <ReadingProgress />
      
      {/* Navigation Bar */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-md z-40 shadow-sm">
        <BlogHeader />
      </div>

      <BlogPostContent post={post} recentPosts={recentPosts} categories={categories} />
    </div>
  )
}
