'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Save, ArrowLeft, Loader2, Image as ImageIcon, Trash2 } from 'lucide-react'
import Link from 'next/link'
// import { client } from '@/lib/sanity'
// import { urlFor } from '@/lib/sanity.image'

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
    fetch('/api/admin/content/categories')
      .then(res => res.json())
      .then(data => setCategories(data.categories || []))
      .catch(console.error)
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
          const res = await fetch('/api/admin/upload/sanity', {
              method: 'POST',
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        title: formData.title,
        slug: { _type: 'slug', current: formData.slug || generateSlug(formData.title) },
        body: [
            {
                _type: 'block',
                style: 'normal',
                children: [
                    { _type: 'span', text: formData.body }
                ],
                markDefs: []
            }
        ],
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
        headers: { 'Content-Type': 'application/json' },
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content (Simple Text)</label>
                    <div className="text-xs text-gray-500 mb-2">
                        Note: This simple editor creates a single text block. For rich formatting, use Sanity Studio.
                    </div>
                    <textarea 
                        rows={10}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md font-sans"
                        value={formData.body}
                        onChange={e => setFormData({ ...formData, body: e.target.value })}
                    ></textarea>
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
