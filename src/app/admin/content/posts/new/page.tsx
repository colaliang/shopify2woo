'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Save, ArrowLeft, Loader2, Image as ImageIcon, Trash2, Sparkles } from 'lucide-react'
import Link from 'next/link'
import supabase from '@/lib/supabase'
import MarkdownEditor from '@/components/admin/editor/MarkdownEditor'
import AiContentPreview from '@/components/admin/ai/AiContentPreview'

interface AiResult {
  title?: string
  slug?: string
  body?: string
  excerpt?: string
  tags?: string[]
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

export default function NewPostPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<{ _id: string, title: string }[]>([])
  const [activeTab, setActiveTab] = useState<'content' | 'seo' | 'settings' | 'ai'>('content')
  
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    body: '',
    categoryId: '',
    // New fields
    mainImageAssetId: '',
    tags: [] as string[],
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
    },
    publishedAt: new Date().toISOString().slice(0, 16), // Format for datetime-local
    language: 'en',
    excerpt: ''
  })

  // AI Generation State
  const [aiConfig, setAiConfig] = useState({
      title: '',
      keywords: '',
      requirements: ''
  })
  const [aiResult, setAiResult] = useState<AiResult | null>(null) // Store full AI response object
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiOutput, setAiOutput] = useState('') // Keep for preview (body content)
  const [aiError, setAiError] = useState('')

  // For image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        const res = await fetch('/api/admin/content/categories', {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        })
        const data = await res.json()
        setCategories(data.categories || [])
      } catch (error) {
        console.error(error)
      }
    }
    init()
  }, [])

  function generateSlug(title: string) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
  }

  // Load cached AI content on mount
  useEffect(() => {
      const cached = localStorage.getItem('admin_ai_generated_content')
      if (cached) {
          try {
              const parsed = JSON.parse(cached)
              // Optional: Check if cache is too old (e.g., > 24 hours)
              // For now, we just load it
              setAiOutput(parsed.content || '')
              setAiConfig(prev => ({
                  ...prev,
                  title: parsed.title || prev.title,
                  keywords: parsed.keywords || prev.keywords,
                  requirements: parsed.requirements || prev.requirements
              }))
          } catch (e) {
              console.error('Failed to parse cached AI content', e)
          }
      }
  }, [])

  async function handleAiGenerate() {
      if (!aiConfig.title) {
          setAiError('Title is required')
          return
      }
      
      setAiGenerating(true)
      setAiOutput('')
      setAiResult(null)
      setAiError('')

      try {
          const { data: { session } } = await supabase.auth.getSession()
          const token = session?.access_token

          const response = await fetch('/api/admin/ai/generate', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                  title: aiConfig.title,
                  keywords: aiConfig.keywords.split(',').map(k => k.trim()),
                  requirements: aiConfig.requirements,
                  language: formData.language
              })
          })

          if (!response.ok) {
              const err = await response.json()
              throw new Error(err.error || 'Failed to generate content')
          }

          const data = await response.json()
          
          let parsedContent: AiResult = {};
          let bodyContent = '';

          try {
            // Attempt to parse JSON content
            parsedContent = JSON.parse(data.content);
            bodyContent = parsedContent.body || '';
          } catch (e) {
            // Fallback if not valid JSON (legacy or error)
            console.warn('AI output is not valid JSON, using raw string', e);
            bodyContent = data.content || '';
            parsedContent = { body: bodyContent };
          }

          setAiOutput(bodyContent)
          setAiResult(parsedContent)
          
          // Cache the result
          localStorage.setItem('admin_ai_generated_content', JSON.stringify({
              title: aiConfig.title,
              keywords: aiConfig.keywords,
              requirements: aiConfig.requirements,
              result: parsedContent,
              timestamp: Date.now()
          }))

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

      // Update form data with AI content
      setFormData(prev => ({
          ...prev,
          title: content.title || aiConfig.title || prev.title,
          slug: content.slug || generateSlug(content.title || aiConfig.title || prev.title),
          body: body,
          excerpt: content.excerpt || prev.excerpt,
          tags: content.tags || prev.tags,
          schemaType: content.seo?.schemaType || prev.schemaType,
          seo: {
              ...prev.seo,
              metaTitle: content.seo?.metaTitle || content.title || aiConfig.title || prev.title,
              metaDescription: content.seo?.metaDescription || body.replace(/<[^>]*>/g, '').slice(0, 150) + '...',
              focusKeyword: content.seo?.focusKeyword || prev.seo.focusKeyword,
              keywords: content.seo?.keywords || prev.seo.keywords,
              // Keep existing noIndex/noFollow unless explicitly set? Usually AI doesn't set these, but let's see.
              // If AI provides them, use them, else keep default/prev.
              noIndex: content.seo?.noIndex !== undefined ? content.seo.noIndex : prev.seo.noIndex,
              noFollow: content.seo?.noFollow !== undefined ? content.seo.noFollow : prev.seo.noFollow,
          },
          openGraph: {
              ...prev.openGraph,
              title: content.openGraph?.title || content.seo?.metaTitle || content.title || prev.openGraph.title,
              description: content.openGraph?.description || content.seo?.metaDescription || prev.openGraph.description
          }
      }))
      
      // Clear cache after applying
      localStorage.removeItem('admin_ai_generated_content')
      
      // Switch to content tab
      setActiveTab('content')
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0]
      if (!file) return

      // Local preview
      setPreviewImage(URL.createObjectURL(file))
      
      const form = new FormData()
      form.append('file', file)

      try {
          const { data: { session } } = await supabase.auth.getSession()
          const token = session?.access_token

          const res = await fetch('/api/admin/upload/sanity', {
              method: 'POST',
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
              body: form
          })
          if (!res.ok) throw new Error('Upload failed')
          const data = await res.json()
          setFormData(prev => ({ ...prev, mainImageAssetId: data.asset._id }))
      } catch (e) {
          console.error(e)
          alert('Failed to upload image')
      }
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
    // We need to construct the image URL. 
    // Ideally, the upload API should return the URL or we use urlFor helper.
    // For Tiptap, we need a direct URL.
    // Since we don't have the sanity client directly here with the image builder setup fully for direct URL return without extra fetch,
    // let's assume we can get the URL from the asset document if we fetched it, 
    // OR we can use the CDN URL pattern: https://cdn.sanity.io/images/<project-id>/<dataset>/<filename>-<width>x<height>.<extension>
    // For simplicity in this step, let's update the upload API to return the URL or use a placeholder if complex.
    // Better yet, let's update the upload API to return the `url` field from the asset document.
    
    return data.asset.url // Ensure API returns this
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      // Logic to handle AI content if user publishes directly from AI tab
      let submitData = { ...formData };
      
      if (activeTab === 'ai' && (aiOutput || aiResult)) {
          // If we are on AI tab and have output, use it for submission
          const content = aiResult || { body: aiOutput };
          const body = content.body || aiOutput;
          const title = content.title || aiConfig.title || formData.title;

          submitData = {
              ...submitData,
              title: title,
              slug: content.slug || formData.slug || generateSlug(title),
              body: body, // Use AI output as body (Markdown)
              excerpt: content.excerpt || submitData.excerpt,
              tags: content.tags || submitData.tags,
              schemaType: content.seo?.schemaType || submitData.schemaType,
              seo: {
                  ...submitData.seo,
                  metaTitle: content.seo?.metaTitle || title,
                  // Strip markdown syntax for meta description roughly
                  metaDescription: content.seo?.metaDescription || body.replace(/[#*`_\[\]]/g, '').slice(0, 150) + '...',
                  focusKeyword: content.seo?.focusKeyword || submitData.seo.focusKeyword,
                  keywords: content.seo?.keywords || submitData.seo.keywords,
                  noIndex: content.seo?.noIndex !== undefined ? content.seo.noIndex : submitData.seo.noIndex,
                  noFollow: content.seo?.noFollow !== undefined ? content.seo.noFollow : submitData.seo.noFollow
              },
              openGraph: {
                  ...submitData.openGraph,
                  title: content.openGraph?.title || content.seo?.metaTitle || title,
                  description: content.openGraph?.description || content.seo?.metaDescription || submitData.openGraph.description
              }
          };
      }

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const payload = {
        title: submitData.title,
        slug: { _type: 'slug', current: submitData.slug || generateSlug(submitData.title) },
        bodyMarkdown: submitData.body, // Save to new markdown field
        bodyHtml: '', // Clear HTML field
        // We still send `body` for compatibility with Studio (maybe empty or stripped text)
        body: [],
        excerpt: submitData.excerpt,
        categories: submitData.categoryId ? [{ _type: 'reference', _ref: submitData.categoryId, _key: Math.random().toString(36).substring(7) }] : [],
        tags: submitData.tags,
        publishedAt: new Date(submitData.publishedAt).toISOString(),
        language: submitData.language,
        schemaType: submitData.schemaType,
        
        // Image
        ...(submitData.mainImageAssetId ? {
            mainImage: {
                _type: 'image',
                asset: { _type: 'reference', _ref: submitData.mainImageAssetId },
                alt: submitData.title // Default alt to title
            }
        } : {}),

        // SEO
        seo: {
            _type: 'seo',
            metaTitle: submitData.seo.metaTitle || submitData.title,
            metaDescription: submitData.seo.metaDescription,
            focusKeyword: submitData.seo.focusKeyword,
            keywords: submitData.seo.keywords,
            noIndex: submitData.seo.noIndex,
            noFollow: submitData.seo.noFollow
        },

        // OpenGraph
        openGraph: {
            _type: 'openGraph',
            title: submitData.openGraph.title || submitData.seo.metaTitle || submitData.title,
            description: submitData.openGraph.description || submitData.seo.metaDescription,
            // image: handled by mainImage if not explicitly set, but schema defines separate OG image. 
            // For now, let's assume if mainImage is set, we might want to use it or leave it blank to fallback in frontend/meta generation.
            // The schema has `image` field in `openGraph` object.
        }
      }

      const res = await fetch('/api/admin/content/posts', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create post')
      }

      router.refresh()
      router.push('/admin/content')
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 w-full max-w-full">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/content" className="flex items-center text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Posts
        </Link>
        <h1 className="text-2xl font-bold">New Post</h1>
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
                  {tab === 'ai' ? 'AI Generator' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
          ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
        
        {/* CONTENT TAB */}
        {activeTab === 'content' && (
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input 
                        type="text" 
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value, slug: generateSlug(e.target.value) })}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL)</label>
                    <input 
                        type="text" 
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                        value={formData.slug}
                        onChange={e => setFormData({ ...formData, slug: e.target.value })}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Main Image</label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                        {previewImage ? (
                            <div className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={previewImage} alt="Preview" className="max-h-64 mx-auto rounded" />
                                <button 
                                    type="button"
                                    onClick={() => { setPreviewImage(null); setFormData(prev => ({ ...prev, mainImageAssetId: '' })) }}
                                    className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <label className="cursor-pointer block">
                                <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                                <span className="text-blue-600 hover:underline">Upload an image</span>
                                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </label>
                        )}
                    </div>
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
                    <p className="text-xs text-gray-500 mt-1">Leave blank to use post title.</p>
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
            </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Publish Date</label>
                    <input 
                        type="datetime-local" 
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
                    </select>
                </div>
            </div>
        )}

        {/* AI TAB */}
        {activeTab === 'ai' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Topic / Title (Required)</label>
                        <input 
                            type="text" 
                            maxLength={100}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g. Top 10 Shopify Apps for Dropshipping in 2025"
                            value={aiConfig.title}
                            onChange={e => setAiConfig({ ...aiConfig, title: e.target.value })}
                        />
                        <p className="text-xs text-gray-500 mt-1 text-right">{aiConfig.title.length}/100</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Keywords (5-10 recommended)</label>
                        <textarea 
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="e.g. shopify apps, dropshipping tools, ecommerce automation"
                            value={aiConfig.keywords}
                            onChange={e => setAiConfig({ ...aiConfig, keywords: e.target.value })}
                        ></textarea>
                        <p className="text-xs text-gray-500 mt-1">Separate keywords with commas.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Requirements</label>
                        <textarea 
                            rows={5}
                            maxLength={1000}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="Specific instructions for the AI (e.g. Focus on free tools, include a comparison table, tone should be professional but friendly...)"
                            value={aiConfig.requirements}
                            onChange={e => setAiConfig({ ...aiConfig, requirements: e.target.value })}
                        ></textarea>
                        <p className="text-xs text-gray-500 mt-1 text-right">{aiConfig.requirements.length}/1000</p>
                    </div>

                    <div className="pt-2">
                        <button 
                            type="button" 
                            onClick={handleAiGenerate}
                            disabled={aiGenerating || !aiConfig.title}
                            className="w-full flex items-center justify-center px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-all shadow-sm"
                        >
                            {aiGenerating ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                    Generating content...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5 mr-2" />
                                    Generate Blog Post
                                </>
                            )}
                        </button>
                        {aiError && (
                            <p className="text-red-600 text-sm mt-2 text-center">{aiError}</p>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-medium text-gray-700">Generated Content Preview</h3>
                    <AiContentPreview 
                        content={aiOutput}
                        onRegenerate={handleAiGenerate}
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
                Publish Post
            </button>
        </div>
      </form>
    </div>
  )
}
