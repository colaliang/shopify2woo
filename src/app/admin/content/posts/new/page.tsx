'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Save, ArrowLeft, Loader2, Image as ImageIcon, Trash2, Sparkles, Copy, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import supabase from '@/lib/supabase'
import { RichTextEditor } from '@/components/admin/editor/RichTextEditor'

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
    seo: {
        metaTitle: '',
        metaDescription: '',
        noIndex: false
    },
    publishedAt: new Date().toISOString().slice(0, 16), // Format for datetime-local
    language: 'en'
  })

  // AI Generation State
  const [aiConfig, setAiConfig] = useState({
      title: '',
      keywords: '',
      requirements: ''
  })
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiOutput, setAiOutput] = useState('')
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
          const content = data.content || ''
          setAiOutput(content)
          
          // Cache the result
          localStorage.setItem('admin_ai_generated_content', JSON.stringify({
              title: aiConfig.title,
              keywords: aiConfig.keywords,
              requirements: aiConfig.requirements,
              content: content,
              timestamp: Date.now()
          }))

      } catch (e) {
          setAiError(e instanceof Error ? e.message : String(e))
      } finally {
          setAiGenerating(false)
      }
  }

  function applyAiContent() {
      if (!aiOutput) return;
      
      // Update form data with AI content
      setFormData(prev => ({
          ...prev,
          title: aiConfig.title || prev.title, // Use AI title input if set
          slug: generateSlug(aiConfig.title || prev.title),
          body: aiOutput,
          seo: {
              ...prev.seo,
              metaTitle: aiConfig.title || prev.title,
              // Try to extract a meta description from the first paragraph or generic
              metaDescription: aiOutput.replace(/<[^>]*>/g, '').slice(0, 150) + '...'
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
      
      if (activeTab === 'ai' && aiOutput) {
          // If we are on AI tab and have output, use it for submission
          const title = aiConfig.title || formData.title;
          submitData = {
              ...submitData,
              title: title,
              slug: formData.slug || generateSlug(title),
              body: aiOutput, // Use AI output as body
              seo: {
                  ...submitData.seo,
                  metaTitle: title,
                  metaDescription: aiOutput.replace(/<[^>]*>/g, '').slice(0, 150) + '...'
              }
          };
      }

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const payload = {
        title: submitData.title,
        slug: { _type: 'slug', current: submitData.slug || generateSlug(submitData.title) },
        // Use raw HTML body. Sanity schema needs to handle this or we convert HTML to Portable Text.
        // For now, let's assume we are storing it as a custom HTML block or we need a converter.
        // However, standard Sanity 'block' type expects Portable Text. 
        // A simple workaround for this "MVP" integration is to store the HTML string in a code block or custom field, 
        // BUT the cleaner way is to convert HTML to Portable Text.
        // Since that's complex to implement client-side without libraries, 
        // we will send the HTML string and let the API route handle it (or just store as string if we updated schema).
        // Let's stick to the previous "simple text" block structure but put the HTML in it for now, 
        // OR better: use a specialized 'html' type if we had one.
        // REVISION: The previous code was:
        // body: [{ _type: 'block', children: [{ _type: 'span', text: formData.body }] }]
        // This treats HTML as plain text. 
        // For a true rich text experience, we should use a library to convert HTML to Portable Text 
        // or just save the HTML string to a new field 'bodyHtml' and use that for rendering if present.
        // Let's modify the schema to accept 'bodyHtml' as well or just force it into the block for now.
        // To keep it robust: We will store the HTML content in a new `bodyHtml` field (need to add to schema?)
        // OR: We just save it as a raw string in a code block for now to prevent breaking.
        // REALISTIC APPROACH: We will treat the whole content as a single text block for now, 
        // accepting that Tiptap HTML will be saved as raw text if we don't convert.
        // WAIT: The user asked to integrate Tiptap. We should try to support it.
        // Let's update the API to try and parse it, or just store the HTML.
        // Let's simply store it as a string field `contentHtml` if the schema allows, 
        // or just dump it into the body text for now.
        // Actually, let's update the post schema to have a `bodyHtml` field to store the raw HTML from Tiptap.
        bodyHtml: submitData.body, 
        // We still send `body` for compatibility with Studio (maybe empty or stripped text)
        body: [],
        categories: submitData.categoryId ? [{ _type: 'reference', _ref: submitData.categoryId }] : [],
        publishedAt: new Date(submitData.publishedAt).toISOString(),
        language: submitData.language,
        
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
            noIndex: submitData.seo.noIndex
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                    <RichTextEditor 
                        content={formData.body}
                        onChange={(html) => setFormData({ ...formData, body: html })}
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
                            maxLength={500}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="Specific instructions for the AI (e.g. Focus on free tools, include a comparison table, tone should be professional but friendly...)"
                            value={aiConfig.requirements}
                            onChange={e => setAiConfig({ ...aiConfig, requirements: e.target.value })}
                        ></textarea>
                        <p className="text-xs text-gray-500 mt-1 text-right">{aiConfig.requirements.length}/500</p>
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
                    <div className="flex justify-between items-center">
                        <h3 className="font-medium text-gray-700">Generated Content Preview</h3>
                        {aiOutput && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleAiGenerate()}
                                    disabled={aiGenerating}
                                    className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
                                    title="Regenerate"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={applyAiContent}
                                    className="flex items-center px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                >
                                    <Copy className="w-3 h-3 mr-1.5" />
                                    Use This Content
                                </button>
                            </div>
                        )}
                    </div>
                    
                    <div className="border border-gray-200 rounded-lg h-[600px] overflow-hidden bg-white">
                        {aiOutput ? (
                            // Use the same RichTextEditor in read-only mode (or interactive but disconnected from form) for preview
                            // Actually, let's just render it as HTML but styled like the editor
                            <div className="h-full overflow-y-auto p-4 prose prose-sm sm:prose lg:prose-lg max-w-none">
                                <div dangerouslySetInnerHTML={{ __html: aiOutput }} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
                                <Sparkles className="w-12 h-12 mb-3 text-gray-300" />
                                <p>AI generated content will appear here.</p>
                            </div>
                        )}
                    </div>
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
