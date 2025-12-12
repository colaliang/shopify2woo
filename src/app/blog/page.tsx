import { client, urlFor } from '@/lib/sanity'
import { getLocalizedTitle } from '@/sanity/lib/languages'
import Link from 'next/link'
import BlogHeader from './components/BlogHeader'
import { Search, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'
import { Metadata } from 'next'
import MarkdownIt from 'markdown-it'
import { getTranslations } from '@/lib/i18nServer'

const md = new MarkdownIt({ html: true, breaks: true })

// Simplified type definition to avoid import errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SanityImageSource = any

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Blog - Insights & Updates',
  description: 'Latest news, tutorials, and insights about e-commerce and dropshipping.',
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
interface Post {
  _id: string
  title: string
  slug: { current: string }
  mainImage: SanityImageSource
  publishedAt: string
  excerpt: string
  categories: { title: string; slug: { current: string } }[]
}

interface Category {
  _id: string
  title: string
  slug: { current: string }
}

// -----------------------------------------------------------------------------
// Data Fetching
// -----------------------------------------------------------------------------
async function getPosts(search?: string, category?: string, language?: string, page = 1, limit = 9) {
  // Diagnostic fetch to check what is actually in the database
  const allPostsRaw = await client.fetch(`*[_type == "post"] { _id, title, language, slug }`, {}, { next: { revalidate: 0 } })
  console.log('[Blog Debug] RAW DATA DUMP:', allPostsRaw)

  const start = (page - 1) * limit
  const end = start + limit

  let conditions = `_type == "post" && defined(slug.current)`
  const params: Record<string, string | number> = {}

  if (search) {
    conditions += ` && (title match $search || pt::text(body) match $search)`
    params.search = `*${search}*`
  }

  if (category) {
    conditions += ` && $category in categories[]->slug.current`
    params.category = category
  }

  if (language) {
    if (language === 'en') {
      // For English, include:
      // 1. Exact match 'en'
      // 2. Undefined (legacy posts)
      // 3. Empty string
      // 4. Case insensitive match (just in case)
      conditions += ` && (language == $language || !defined(language) || language == "" || language == "EN")`
    } else {
      conditions += ` && language == $language`
    }
    params.language = language
  }

  const filter = `*[${conditions}]`

  console.log('[Blog Debug] Filter:', filter)
  console.log('[Blog Debug] Params:', params)

  // Count total for pagination
  const countQuery = `count(${filter})`
  const total = await client.fetch(countQuery, params, { next: { revalidate: 0 } })
  console.log('[Blog Debug] Total count:', total)

  // Fetch posts
  const query = `${filter} | order(publishedAt desc) [${start}...${end}] {
    _id,
    title,
    slug,
    publishedAt,
    language,
    // Use body text as excerpt fallback if excerpt is missing, limit to 200 chars
    "excerpt": coalesce(excerpt, pt::text(body)[0...200] + "..."),
    mainImage,
    "categories": categories[]->{title, slug}
  }`
  
  const postsData = await client.fetch(query, params, { next: { revalidate: 0 } })

  // Localize categories inside posts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts = postsData?.map((p: any) => ({
    ...p,
    title: getLocalizedTitle(p.title, language || 'en'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    categories: p.categories?.map((c: any) => ({
      ...c,
      title: getLocalizedTitle(c.title, language || 'en')
    }))
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.log('[Blog Debug] Fetched posts:', posts?.length, posts?.map((p: any) => ({ title: p.title, lang: p.language })))
  
  return { posts: posts || [], total: total || 0 }
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
    mainImage,
    "categories": categories[]->{title, slug}
  }`, params, { next: { revalidate: 0 } })

  // Localize categories inside recent posts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts = postsData?.map((p: any) => ({
    ...p,
    title: getLocalizedTitle(p.title, language || 'en'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    categories: p.categories?.map((c: any) => ({
      ...c,
      title: getLocalizedTitle(c.title, language || 'en')
    }))
  })) || []
  
  return posts
}

async function getCategories(language: string) {
  const categories = await client.fetch(`*[_type == "category"] | order(title asc) {
    _id,
    title,
    slug
  }`)
  
  // Map category title to current language
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return categories?.map((c: any) => ({
    ...c,
    title: getLocalizedTitle(c.title, language)
  })) || []
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export default async function BlogPage(props: { searchParams: Promise<{ q?: string; category?: string; page?: string; lng?: string }> }) {
  const searchParams = await props.searchParams
  const page = Number(searchParams.page) || 1
  const search = searchParams.q || ''
  const categorySlug = searchParams.category || ''
  const lng = searchParams.lng || 'en'

  // Map 'en' to 'en-US' for date formatting to ensure English month names
  const dateLocale = lng === 'en' ? 'en-US' : lng;

  const [{ posts, total }, categories, recentPosts, t] = await Promise.all([
    getPosts(search, categorySlug, lng, page),
    getCategories(lng),
    getRecentPosts(lng),
    getTranslations(lng)
  ])

  const totalPages = Math.ceil(total / 9)

  return (
    <div className="min-h-screen bg-gray-50">
      <BlogHeader />
      
      {/* Main Content */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row gap-12 justify-center max-w-[1920px] mx-auto">
          
          {/* Posts List (Left Column) */}
          <div className="lg:w-2/3 xl:w-3/5">
            {posts.length > 0 ? (
              <div className="space-y-12">
                {posts.map((post: Post) => {
                  const date = new Date(post.publishedAt)
                  const day = date.getDate().toString().padStart(2, '0')
                  const month = date.toLocaleString(dateLocale, { month: 'short' })
                  
                  // Render excerpt as markdown if present
                  const excerptHtml = post.excerpt ? md.render(post.excerpt) : ''

                  return (
                  <div key={post._id} className="group rounded-none sm:rounded-xl overflow-hidden">
                    {/* Image */}
                    <Link href={`/blog/${post.slug.current}`} className="block relative aspect-[16/9] bg-gray-100 overflow-hidden rounded-lg">
                      {post.mainImage ? (
                        <div className="absolute inset-0">
                             {/* eslint-disable-next-line @next/next/no-img-element */}
                             <img 
                                src={urlFor(post.mainImage).width(1200).height(675).url()}
                                alt={post.title}
                                className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                             />
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400">
                          <ImageIcon className="w-12 h-12" />
                        </div>
                      )}
                      
                      {/* Date Badge */}
                      <div className="absolute top-6 left-6 bg-white shadow-sm rounded-sm p-3 text-center min-w-[60px] flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-gray-900 leading-none">{day}</span>
                        <span className="text-xs font-semibold text-gray-500 uppercase mt-1">{month}</span>
                      </div>
                    </Link>

                    {/* Content */}
                    <div className="pt-6">
                      <Link href={`/blog/${post.slug.current}`}>
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 hover:text-blue-600 transition-colors">
                            {post.title}
                        </h2>
                      </Link>
                      
                      <div 
                        className="text-gray-600 text-base leading-relaxed mb-6 line-clamp-3 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: excerptHtml }}
                      />
                      
                      <div className="flex items-center justify-between border-t border-gray-100 pt-6">
                        <Link href={`/blog/${post.slug.current}`} className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors uppercase tracking-wide">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(t?.blog as any)?.read_more || 'Read More'} <ChevronRight className="w-4 h-4 ml-1" />
                        </Link>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-gray-400" />
                </div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <h3 className="text-lg font-medium text-gray-900">{(t?.blog as any)?.no_posts || 'No posts found'}</h3>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <p className="text-gray-500 mt-2">{(t?.blog as any)?.try_adjusting || 'Try adjusting your search or filter.'}</p>
                <Link href="/blog" className="inline-block mt-4 text-blue-600 hover:underline">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(t?.blog as any)?.clear_filters || 'Clear all filters'}
                </Link>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-16 flex justify-center gap-2">
                <Link
                  href={`/blog?page=${Math.max(1, page - 1)}${search ? `&q=${search}` : ''}${categorySlug ? `&category=${categorySlug}` : ''}`}
                  className={`p-2 rounded-lg border border-gray-200 transition-colors ${
                    page <= 1 ? 'text-gray-300 pointer-events-none' : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                  }`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Link>
                <div className="flex items-center gap-1 px-4 font-medium text-gray-600">
                    Page {page} of {totalPages}
                </div>
                <Link
                  href={`/blog?page=${Math.min(totalPages, page + 1)}${search ? `&q=${search}` : ''}${categorySlug ? `&category=${categorySlug}` : ''}`}
                  className={`p-2 rounded-lg border border-gray-200 transition-colors ${
                    page >= totalPages ? 'text-gray-300 pointer-events-none' : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                  }`}
                >
                  <ChevronRight className="w-5 h-5" />
                </Link>
              </div>
            )}
          </div>

          {/* Sidebar (Right Column) */}
          <aside className="lg:w-1/3 xl:w-1/5 space-y-12 sticky top-8 self-start">
            
            {/* Search */}
            <div>
                <form action="/blog" className="relative">
                    <input 
                        name="q"
                        defaultValue={search}
                        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                        placeholder={(t?.blog as any)?.search || 'Search'} 
                        className="w-full pl-4 pr-10 py-3 bg-white border border-gray-200 rounded-sm focus:outline-none focus:border-blue-500 transition-colors text-sm"
                    />
                    <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600">
                        <Search className="w-4 h-4" />
                    </button>
                    {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
                </form>
            </div>

            {/* Recent Posts */}
            <div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <h3 className="text-lg font-medium text-gray-900 mb-6 pb-2 border-b border-gray-100">{(t?.blog as any)?.recent_posts || 'Recent Posts'}</h3>
                <div className="space-y-6">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {recentPosts.map((post: any) => (
                        <Link key={post._id} href={`/blog/${post.slug.current}`} className="flex gap-4 group">
                            <div className="w-24 h-24 flex-shrink-0 bg-gray-100 rounded-md overflow-hidden">
                                {post.mainImage ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img 
                                        src={urlFor(post.mainImage).width(200).height(200).url()}
                                        alt={post.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                                        <ImageIcon className="w-8 h-8" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 flex flex-col justify-between py-1 h-24">
                                <h4 className="text-base font-bold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors leading-snug">
                                    {post.title}
                                </h4>
                                <div className="text-xs text-gray-500 font-medium">
                                    {new Date(post.publishedAt).toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', year: 'numeric' })}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Categories */}
            <div>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <h3 className="text-lg font-medium text-gray-900 mb-6 pb-2 border-b border-gray-100">{(t?.blog as any)?.categories || 'Categories'}</h3>
              <div className="flex flex-col space-y-3">
                <Link 
                  href="/blog"
                  className={`text-sm transition-colors ${
                    !categorySlug 
                      ? 'text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-blue-600'
                  }`}
                >
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(t?.blog as any)?.all_posts || 'All Posts'}
                </Link>
                {categories.map((cat: Category) => (
                  <Link 
                    key={cat._id}
                    href={`/blog?category=${cat.slug.current}${search ? `&q=${search}` : ''}`}
                    className={`text-sm transition-colors ${
                      categorySlug === cat.slug.current
                        ? 'text-blue-600 font-medium' 
                        : 'text-gray-600 hover:text-blue-600'
                    }`}
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
