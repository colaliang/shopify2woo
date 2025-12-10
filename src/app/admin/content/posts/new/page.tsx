'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Save, ArrowLeft, Loader2, Image as ImageIcon, Trash2 } from 'lucide-react'
import Link from 'next/link'
// import { client } from '@/lib/sanity'
// import { urlFor } from '@/lib/sanity.image'
import supabase from '@/lib/supabase'
import { RichTextEditor } from '@/components/admin/editor/RichTextEditor'

export default function NewPostPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<{ _id: string, title: string }[]>([])
  const [activeTab, setActiveTab] = useState<'content' | 'seo' | 'settings'>('content')
  
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
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const payload = {
        title: formData.title,
        slug: { _type: 'slug', current: formData.slug || generateSlug(formData.title) },
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
        bodyHtml: formData.body, 
        // We still send `body` for compatibility with Studio (maybe empty or stripped text)
        body: [],
        categories: formData.categoryId ? [{ _type: 'reference', _ref: formData.categoryId }] : [],
        publishedAt: new Date(formData.publishedAt).toISOString(),
        language: formData.language,
        
        // Image
        ...(formData.mainImageAssetId ? {
            mainImage: {
                _type: 'image',
                asset: { _type: 'reference', _ref: formData.mainImageAssetId },
                alt: formData.title // Default alt to title
            }
        } : {}),

        // SEO
        seo: {
            _type: 'seo',
            metaTitle: formData.seo.metaTitle || formData.title,
            metaDescription: formData.seo.metaDescription,
            noIndex: formData.seo.noIndex
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

      router.push('/admin/content')
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/content" className="flex items-center text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Posts
        </Link>
        <h1 className="text-2xl font-bold">New Post</h1>
      </div>

      <div className="flex gap-4 mb-6 border-b border-gray-200">
          {['content', 'seo', 'settings'].map((tab) => (
              <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab as 'content' | 'seo' | 'settings')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab 
                      ? 'border-blue-500 text-blue-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
