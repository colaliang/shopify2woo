import { client, urlFor } from '@/lib/sanity'
import Link from 'next/link'
import { ArrowLeft, Share2, Image as ImageIcon, Search } from 'lucide-react'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TableOfContents from './components/TableOfContents'
import ReadingProgress from './components/ReadingProgress'
import ContentRenderer from './components/ContentRenderer'

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

  const date = new Date(post.publishedAt)
  const day = date.getDate().toString().padStart(2, '0')
  const month = date.toLocaleString('default', { month: 'short' })

  return (
    <div className="min-h-screen bg-gray-50">
      <ReadingProgress />
      
      {/* Navigation Bar */}
      <div className="border-b border-gray-100 sticky top-0 bg-white/90 backdrop-blur-md z-40 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
              <Link href="/blog" className="flex items-center text-gray-600 hover:text-blue-600 transition-colors font-medium">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Blog
              </Link>
              <div className="flex items-center gap-4">
                  <button className="text-gray-400 hover:text-gray-600 transition-colors" title="Share">
                      <Share2 className="w-5 h-5" />
                  </button>
              </div>
          </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row gap-12">
            
            {/* Main Content (Left) */}
            <article className="lg:w-2/3 xl:w-3/4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Featured Image with Date Badge */}
                    <div className="relative aspect-[16/9] bg-gray-100">
                         {post.mainImage ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img 
                                src={urlFor(post.mainImage).width(1200).height(675).url()} 
                                alt={post.title} 
                                className="w-full h-full object-cover"
                            />
                         ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <ImageIcon className="w-16 h-16" />
                            </div>
                         )}
                         {/* Date Badge */}
                         <div className="absolute top-6 left-6 bg-white shadow-md rounded-lg p-3 text-center min-w-[70px] flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold text-gray-900 leading-none">{day}</span>
                            <span className="text-xs font-bold text-gray-500 uppercase mt-1 tracking-wider">{month}</span>
                         </div>
                    </div>

                    <div className="p-8 sm:p-12">
                        {/* Title */}
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-8">
                            {post.title}
                        </h1>

                        {/* Content */}
                        {post.bodyHtml ? (
                            <ContentRenderer html={post.bodyHtml} />
                        ) : (
                            <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200 text-yellow-800">
                                This post does not have HTML content available.
                            </div>
                        )}
                        
                        {/* Footer / Tags */}
                        <div className="mt-12 pt-8 border-t border-gray-100 flex flex-wrap gap-3">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {post.categories?.map((cat: any) => (
                                <Link 
                                    key={cat.slug.current} 
                                    href={`/blog?category=${cat.slug.current}`}
                                    className="inline-flex items-center px-4 py-2 rounded-full bg-gray-50 text-gray-700 text-sm font-medium hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                >
                                    {/* <Tag className="w-3 h-3 mr-2" /> */}
                                    {cat.title}
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </article>

            {/* Sidebar (Right) */}
            <aside className="lg:w-1/3 xl:w-1/4 space-y-10">
                
                {/* Search */}
                <div>
                    <form action="/blog" className="relative">
                        <input 
                            name="q"
                            placeholder="Search" 
                            className="w-full pl-4 pr-10 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm shadow-sm"
                        />
                        <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600">
                            <Search className="w-4 h-4" />
                        </button>
                    </form>
                </div>

                {/* Table of Contents */}
                {post.bodyHtml && (
                    <TableOfContents content={post.bodyHtml} />
                )}

                {/* Recent Posts */}
                <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Recent Posts</h3>
                    <div className="space-y-6">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {recentPosts.map((p: any) => (
                            <Link key={p._id} href={`/blog/${p.slug.current}`} className="flex gap-4 group">
                                <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden shadow-sm">
                                    {p.mainImage ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img 
                                            src={urlFor(p.mainImage).width(160).height(160).url()}
                                            alt={p.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                                            <ImageIcon className="w-6 h-6" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-bold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors mb-1 leading-snug">
                                        {p.title}
                                    </h4>
                                    <div className="text-xs text-gray-500 font-medium">
                                        {new Date(p.publishedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Categories */}
                <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Categories</h3>
                    <div className="flex flex-col space-y-2">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {categories.map((cat: any) => (
                            <Link 
                                key={cat._id}
                                href={`/blog?category=${cat.slug.current}`}
                                className="text-sm text-gray-600 hover:text-blue-600 hover:translate-x-1 transition-all py-1"
                            >
                                {cat.title}
                            </Link>
                        ))}
                    </div>
                </div>
            </aside>
        </div>
      </div>
    </div>
  )
}
