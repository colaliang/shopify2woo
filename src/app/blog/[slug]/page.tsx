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
  mainImageUrl?: string
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
async function getPost(slug: string, language: string = 'en'): Promise<Post | null> {
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

  // Resolve localized fields
  const langKey = language.replace(/-/g, '_')
  
  // Helper to resolve string or object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolve = (data: any) => {
    if (!data) return undefined
    if (typeof data === 'string') return data
    return data[langKey] || data['en'] || data[Object.keys(data)[0]]
  }
  
  // Helper to resolve array (like keyTakeaways)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveArray = (data: any) => {
      if (!data) return undefined
      if (Array.isArray(data)) return data
      return data[langKey] || data['en'] || []
  }

  const localizedPost = {
      ...postData,
      title: resolve(postData.localizedTitle) || postData.title,
      excerpt: resolve(postData.localizedExcerpt) || postData.excerpt,
      bodyMarkdown: resolve(postData.localizedBodyMarkdown) || postData.bodyMarkdown,
      keyTakeaways: resolveArray(postData.localizedKeyTakeaways) || postData.keyTakeaways,
      faq: resolveArray(postData.localizedFaq) || postData.faq,
      mainImageUrl: resolve(postData.localizedMainImageUrl),
      mainImage: resolve(postData.localizedMainImage) || postData.mainImage,
      
      seo: {
          metaTitle: resolve(postData.seo?.metaTitleLocalized) || postData.seo?.metaTitle,
          metaDescription: resolve(postData.seo?.metaDescriptionLocalized) || postData.seo?.metaDescription,
          noIndex: postData.seo?.noIndex,
          schemaType: postData.schemaType
      },
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categories: postData.categories?.map((c: any) => ({
          ...c,
          title: getLocalizedTitle(c.title, language)
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      relatedPosts: postData.relatedPosts?.map((rp: any) => ({
          ...rp,
          title: rp.localizedTitle ? getLocalizedTitle(rp.localizedTitle, language) : rp.title,
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
    localizedTitle,
    slug,
    publishedAt,
    mainImage
  }`, params)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return postsData?.map((p: any) => ({
      ...p,
      title: p.localizedTitle 
        ? getLocalizedTitle(p.localizedTitle, language || 'en') 
        : p.title || 'Untitled'
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
export async function generateMetadata(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ lng?: string }> }): Promise<Metadata> {
  const params = await props.params
  const searchParams = await props.searchParams
  const lng = searchParams.lng || 'en'
  const post = await getPost(params.slug, lng)
  
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
        images: post.mainImageUrl ? [post.mainImageUrl] : (post.mainImage ? [urlFor(post.mainImage).width(1200).height(630).url()] : []),
    }
  }
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export default async function BlogPostPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ lng?: string }> }) {
  const params = await props.params
  const searchParams = await props.searchParams
  const lng = searchParams.lng || 'en'
  
  const post = await getPost(params.slug, lng)

  if (!post) {
    notFound()
  }

  const [recentPosts, categories] = await Promise.all([
    getRecentPosts(lng),
    getCategories(lng)
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
