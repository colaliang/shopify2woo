import { client, urlFor } from '@/lib/sanity'
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categories: postData.categories?.map((c: any) => ({
          ...c,
          title: c.title?.[language] || c.title?.en || 'Untitled'
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      relatedPosts: postData.relatedPosts?.map((rp: any) => ({
          ...rp,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categories: rp.categories?.map((c: any) => ({
              ...c,
              title: c.title?.[language] || c.title?.en || 'Untitled'
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

  return await client.fetch(`*[${conditions}] | order(publishedAt desc) [0...5] {
    _id,
    title,
    slug,
    publishedAt,
    mainImage
  }`, params)
}

async function getCategories() {
  return await client.fetch(`*[_type == "category"] | order(title asc) {
    _id,
    title,
    slug
  }`)
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
    getCategories()
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
