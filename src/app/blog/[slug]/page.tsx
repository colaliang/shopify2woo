import { client, urlFor } from '@/lib/sanity'
import Link from 'next/link'
import BlogHeader from '../components/BlogHeader'
import BlogPostContent from './components/BlogPostContent'
import { ArrowLeft, Share2 } from 'lucide-react'
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
  bodyHtml?: string
  bodyMarkdown?: string
  body?: unknown[]
  excerpt?: string
  categories: { title: string; slug: { current: string } }[]
  seo?: {
      metaTitle?: string
      metaDescription?: string
      noIndex?: boolean
  }
}

// -----------------------------------------------------------------------------
// Data Fetching
// -----------------------------------------------------------------------------
async function getPost(slug: string): Promise<Post | null> {
  const query = `*[_type == "post" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    publishedAt,
    mainImage,
    bodyHtml,
    bodyMarkdown,
    body,
    excerpt,
    "categories": categories[]->{title, slug},
    seo
  }`
  
  return await client.fetch(query, { slug })
}

async function getRecentPosts() {
  return await client.fetch(`*[_type == "post" && defined(slug.current)] | order(publishedAt desc) [0...5] {
    _id,
    title,
    slug,
    publishedAt,
    mainImage
  }`)
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
  const [post, recentPosts, categories] = await Promise.all([
    getPost(params.slug),
    getRecentPosts(),
    getCategories()
  ])

  if (!post) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ReadingProgress />
      
      {/* Navigation Bar */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-md z-40 shadow-sm">
        <BlogHeader />
        <div className="border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between text-sm">
                <Link href="/blog" className="flex items-center text-gray-600 hover:text-blue-600 transition-colors font-medium">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Blog
                </Link>
                <div className="flex items-center gap-4">
                    <button className="text-gray-400 hover:text-gray-600 transition-colors" title="Share">
                        <Share2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
      </div>

      <BlogPostContent post={post} recentPosts={recentPosts} categories={categories} />
    </div>
  )
}
