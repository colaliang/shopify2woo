'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Save, ArrowLeft, Loader2, Sparkles, Trash2 } from 'lucide-react'
import Link from 'next/link'
import supabase from '@/lib/supabase'

import CoverImageUploader from '@/components/admin/post/CoverImageUploader'
import MarkdownEditor from '@/components/admin/editor/MarkdownEditor'
import AiContentPreview from '@/components/admin/ai/AiContentPreview'
import TurndownService from 'turndown'

interface AiResult {
  title?: string
  slug?: string
  body?: string
  excerpt?: string
  tags?: string[]
  keyTakeaways?: string[]
  faq?: { question: string; answer: string }[]
  seo?: {
    metaTitle?: string
    metaDescription?: string
    focusKeyword?: string
    keywords?: string[]
    schemaType?: string
    noIndex?: boolean
    noFollow?: boolean
  }
  openGraph?: {
    title?: string
    description?: string
  }
}

export default function EditPostPage() {
  const router = useRouter()
  const params = useParams()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [activeTab, setActiveTab] = useState<'content' | 'seo' | 'settings' | 'ai'>('content')
  const [categories, setCategories] = useState<{ _id: string, title: string }[]>([])
  const [coverImageUrl, setCoverImageUrl] = useState<string>('')
  
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    body: '', 
    categoryId: '',
    mainImageAssetId: '',
    publishedAt: '',
    language: 'en',
    excerpt: '',
    tags: [] as string[],
    keyTakeaways: [] as string[],
    faq: [] as { question: string; answer: string }[],
    schemaType: 'BlogPosting',
    seo: {
        metaTitle: '',
        metaDescription: '',
        focusKeyword: '',
        keywords: [] as string[],
        noIndex: false,
        noFollow: false
    },
    openGraph: {
        title: '',
        description: ''
    }
  })

  // AI State
  const [aiConfig, setAiConfig] = useState({
      requirements: ''
  })
  const [aiResult, setAiResult] = useState<AiResult | null>(null)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiOutput, setAiOutput] = useState('')
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    const id = params?.id
    if (!id) return

    async function init() {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {}

            const [catData, postData] = await Promise.all([
                fetch('/api/admin/content/categories', { headers }).then(r => r.json()),
                fetch(`/api/admin/content/posts/${id}`, { headers }).then(r => r.json())
            ])

            setCategories(catData.categories || [])
            
            if (postData.post) {
                const p = postData.post
                let bodyMarkdown = ''
                
                if (p.bodyMarkdown) {
                    bodyMarkdown = p.bodyMarkdown
                } else if (p.bodyHtml) {
                    const turndownService = new TurndownService()
                    bodyMarkdown = turndownService.turndown(p.bodyHtml)
                } else if (Array.isArray(p.body)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    bodyMarkdown = p.body.map((b: any) => b.children?.map((c: any) => c.text).join('')).join('\n\n')
                }

                let initialCoverUrl = ''
                if (p.mainImage?.asset) {
                    const ref = p.mainImage.asset._ref || p.mainImage.asset._id
                    if (ref) {
                         const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
                         const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
                         const [, assetId, dimensions, extension] = ref.split('-')
                         initialCoverUrl = `https://cdn.sanity.io/images/${projectId}/${dataset}/${assetId}-${dimensions}.${extension}`
                    }
                }

                setCoverImageUrl(initialCoverUrl)
                setFormData({
                    title: p.title || '',
                    slug: p.slug?.current || '',
                    body: bodyMarkdown,
                    categoryId: p.categories?.[0]?._ref || '',
                    mainImageAssetId: p.mainImage?.asset?._ref || '',
                    publishedAt: p.publishedAt ? p.publishedAt.slice(0, 16) : new Date().toISOString().slice(0, 16),
                    language: p.language || 'en',
                    excerpt: p.excerpt || '',
                    tags: p.tags || [],
                    keyTakeaways: p.keyTakeaways || [],
                    faq: p.faq || [],
                    schemaType: p.schemaType || 'BlogPosting',
                    seo: {
                        metaTitle: p.seo?.metaTitle || '',
                        metaDescription: p.seo?.metaDescription || '',
                        focusKeyword: p.seo?.focusKeyword || '',
                        keywords: p.seo?.keywords || [],
                        noIndex: p.seo?.noIndex || false,
                        noFollow: p.seo?.noFollow || false
                    },
                    openGraph: {
                        title: p.openGraph?.title || '',
                        description: p.openGraph?.description || ''
                    }
                })
            }
        } catch (error) {
            console.error(error)
        } finally {
            setFetching(false)
        }
    }
    init()
  }, [params?.id])

  async function handleCoverImageSave(file: File) {
      const form = new FormData()
      form.append('file', file)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/api/admin/upload/sanity', {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: form
      })

      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      
      setCoverImageUrl(data.asset.url)
      setFormData(prev => ({ ...prev, mainImageAssetId: data.asset._id }))
  }

  async function handleEditorImageUpload(file: File): Promise<string> {
    const form = new FormData()
    form.append('file', file)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const res = await fetch('/api/admin/upload/sanity', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: form
    })

    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    return data.asset.url
  }

  async function handleAiOptimize() {
      if (!formData.title) {
          setAiError('Title is required for optimization')
          return
      }
      
      setAiGenerating(true)
      setAiOutput('')
      setAiResult(null)
      setAiError('')

      try {
          const { data: { session } } = await supabase.auth.getSession()
          const token = session?.access_token

          const response = await fetch('/api/admin/ai/optimize', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                  title: formData.title,
                  body: formData.body,
                  keywords: formData.seo.keywords,
                  requirements: aiConfig.requirements,
                  language: formData.language
              })
          })

          if (!response.ok) {
              const err = await response.json()
              throw new Error(err.error || 'Failed to optimize content')
          }

          const data = await response.json()
          
          let parsedContent: AiResult = {};
          let bodyContent = '';

          try {
            parsedContent = JSON.parse(data.content);
            bodyContent = parsedContent.body || '';
          } catch (e) {
            console.warn('AI output is not valid JSON, using raw string', e);
            bodyContent = data.content || '';
            parsedContent = { body: bodyContent };
          }

          setAiOutput(bodyContent)
          setAiResult(parsedContent)

      } catch (e) {
          setAiError(e instanceof Error ? e.message : String(e))
      } finally {
          setAiGenerating(false)
      }
  }

  function applyAiContent() {
      if (!aiResult && !aiOutput) return;
      
      const content = aiResult || { body: aiOutput };
      const body = content.body || aiOutput;

      setFormData(prev => ({
          ...prev,
          title: content.title || prev.title,
          slug: content.slug || prev.slug,
          body: body,
          excerpt: content.excerpt || prev.excerpt,
          tags: content.tags || prev.tags,
          keyTakeaways: content.keyTakeaways || prev.keyTakeaways,
          faq: content.faq || prev.faq,
          schemaType: content.seo?.schemaType || prev.schemaType,
          seo: {
              ...prev.seo,
              metaTitle: content.seo?.metaTitle || prev.seo.metaTitle,
              metaDescription: content.seo?.metaDescription || prev.seo.metaDescription,
              focusKeyword: content.seo?.focusKeyword || prev.seo.focusKeyword,
              keywords: content.seo?.keywords || prev.seo.keywords,
              noIndex: content.seo?.noIndex !== undefined ? content.seo.noIndex : prev.seo.noIndex,
              noFollow: content.seo?.noFollow !== undefined ? content.seo.noFollow : prev.seo.noFollow,
          },
          openGraph: {
              ...prev.openGraph,
              title: content.openGraph?.title || prev.openGraph.title,
              description: content.openGraph?.description || prev.openGraph.description
          }
      }))
      
      setActiveTab('content')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        title: formData.title,
        slug: { _type: 'slug', current: formData.slug },
        bodyMarkdown: formData.body,
        bodyHtml: '',
        body: [],
        excerpt: formData.excerpt,
        publishedAt: new Date(formData.publishedAt).toISOString(),
        language: formData.language,
        tags: formData.tags,
        keyTakeaways: formData.keyTakeaways,
        faq: formData.faq?.map(f => ({
            _key: Math.random().toString(36).substring(7),
            question: f.question,
            answer: f.answer
        })),
        schemaType: formData.schemaType,
        
        ...(formData.categoryId ? { categories: [{ _type: 'reference', _ref: formData.categoryId, _key: Math.random().toString(36).substring(7) }] } : {}),
        
        ...(formData.mainImageAssetId ? {
            mainImage: {
                _type: 'image',
                asset: { _type: 'reference', _ref: formData.mainImageAssetId },
                alt: formData.title
            }
        } : {}),

        seo: {
            _type: 'seo',
            metaTitle: formData.seo.metaTitle,
            metaDescription: formData.seo.metaDescription,
            focusKeyword: formData.seo.focusKeyword,
            keywords: formData.seo.keywords,
            noIndex: formData.seo.noIndex,
            noFollow: formData.seo.noFollow
        },

        openGraph: {
            _type: 'openGraph',
            title: formData.openGraph.title,
            description: formData.openGraph.description
        }
      }

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`/api/admin/content/posts/${params?.id}`, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Failed to update post')

      router.push('/admin/content')
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  if (fetching) return <div className="p-8 text-center">Loading...</div>

  return (
    <div className="p-8 w-full max-w-full">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/content" className="flex items-center text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Posts
        </Link>
        <h1 className="text-2xl font-bold">Edit Post</h1>
      </div>

      <div className="flex gap-4 mb-6 border-b border-gray-200">
          {['content', 'seo', 'settings', 'ai'].map((tab) => (
              <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab as 'content' | 'seo' | 'settings' | 'ai')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === tab 
                      ? 'border-blue-500 text-blue-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                  {tab === 'ai' && <Sparkles className="w-4 h-4" />}
                  {tab === 'ai' ? 'AI Optimizer' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
          ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
        
        {/* CONTENT TAB */}
        {activeTab === 'content' && (
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image</label>
                    <CoverImageUploader 
                        currentImage={coverImageUrl}
                        onSave={handleCoverImageSave}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input 
                        type="text" 
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                    <input 
                        type="text" 
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                        value={formData.slug}
                        onChange={e => setFormData({ ...formData, slug: e.target.value })}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt (Markdown supported)</label>
                    <textarea 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm font-mono"
                        rows={3}
                        value={formData.excerpt}
                        onChange={e => setFormData({ ...formData, excerpt: e.target.value })}
                        placeholder="Short summary for list views and SEO."
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={formData.categoryId}
                        onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                    >
                        <option value="">Select a category...</option>
                        {categories.map(c => (
                            <option key={c._id} value={c._id}>{c.title}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content (Markdown)</label>
                    <MarkdownEditor 
                        content={formData.body}
                        onChange={(md) => setFormData({ ...formData, body: md })}
                        onImageUpload={handleEditorImageUpload}
                    />
                </div>
            </div>
        )}

        {/* SEO TAB */}
        {activeTab === 'seo' && (
            <div className="space-y-6">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SEO Title</label>
                    <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder={formData.title}
                        value={formData.seo.metaTitle}
                        onChange={e => setFormData({ 
                            ...formData, 
                            seo: { ...formData.seo, metaTitle: e.target.value } 
                        })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Meta Description</label>
                    <textarea 
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={formData.seo.metaDescription}
                        onChange={e => setFormData({ 
                            ...formData, 
                            seo: { ...formData.seo, metaDescription: e.target.value } 
                        })}
                    ></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Keywords (Comma separated)</label>
                    <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={formData.seo.keywords.join(', ')}
                        onChange={e => setFormData({ 
                            ...formData, 
                            seo: { ...formData.seo, keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) } 
                        })}
                    />
                </div>
                <div className="flex items-center">
                    <input 
                        type="checkbox" 
                        id="noIndex"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300"
                        checked={formData.seo.noIndex}
                        onChange={e => setFormData({ 
                            ...formData, 
                            seo: { ...formData.seo, noIndex: e.target.checked } 
                        })}
                    />
                    <label htmlFor="noIndex" className="ml-2 block text-sm text-gray-900">
                        No Index (Hide from search engines)
                    </label>
                </div>
                
                <div className="pt-4 border-t">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Structured Data</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Key Takeaways</label>
                            {formData.keyTakeaways.map((item, idx) => (
                                <div key={idx} className="flex gap-2 mb-2">
                                    <input 
                                        type="text"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                                        value={item}
                                        onChange={e => {
                                            const newItems = [...formData.keyTakeaways];
                                            newItems[idx] = e.target.value;
                                            setFormData({ ...formData, keyTakeaways: newItems });
                                        }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const newItems = formData.keyTakeaways.filter((_, i) => i !== idx);
                                            setFormData({ ...formData, keyTakeaways: newItems });
                                        }}
                                        className="p-2 text-red-500 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <button 
                                type="button"
                                onClick={() => setFormData({ ...formData, keyTakeaways: [...formData.keyTakeaways, ''] })}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                + Add Takeaway
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Published Date</label>
                        <input 
                            type="datetime-local" 
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            value={formData.publishedAt}
                            onChange={e => setFormData({ ...formData, publishedAt: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                        <select 
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            value={formData.language}
                            onChange={e => setFormData({ ...formData, language: e.target.value })}
                        >
                            <option value="en">English</option>
                            <option value="zh-CN">Chinese (Simplified)</option>
                            <option value="zh-TW">Chinese (Traditional)</option>
                            <option value="de">German</option>
                            <option value="fr">French</option>
                            <option value="es">Spanish</option>
                            <option value="it">Italian</option>
                            <option value="ja">Japanese</option>
                            <option value="ko">Korean</option>
                            <option value="pt">Portuguese</option>
                            <option value="ru">Russian</option>
                            <option value="ar">Arabic</option>
                        </select>
                    </div>
                </div>
            </div>
        )}

        {/* AI TAB */}
        {activeTab === 'ai' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">AI Optimization</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Improve your existing content, generate SEO metadata, and add structured data automatically.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Optimization Instructions</label>
                        <textarea 
                            rows={5}
                            maxLength={1000}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="e.g. Make the tone more professional, add 2 external links to authoritative sources, focus on 'dropshipping tools' keyword..."
                            value={aiConfig.requirements}
                            onChange={e => setAiConfig({ ...aiConfig, requirements: e.target.value })}
                        ></textarea>
                    </div>

                    <div className="pt-2">
                        <button 
                            type="button" 
                            onClick={handleAiOptimize}
                            disabled={aiGenerating}
                            className="w-full flex items-center justify-center px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-all shadow-sm"
                        >
                            {aiGenerating ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                    Optimizing content...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5 mr-2" />
                                    Optimize Post
                                </>
                            )}
                        </button>
                        {aiError && (
                            <p className="text-red-600 text-sm mt-2 text-center">{aiError}</p>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-medium text-gray-700">Optimization Preview</h3>
                    <AiContentPreview 
                        content={aiOutput}
                        onRegenerate={handleAiOptimize}
                        onUseContent={applyAiContent}
                        isGenerating={aiGenerating}
                    />
                </div>
            </div>
        )}

        <div className="flex justify-end pt-4 border-t">
            <button 
                type="submit" 
                disabled={loading}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Update Post
            </button>
        </div>
      </form>
    </div>
  )
}
