'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Save, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import supabase from '@/lib/supabase'

import CoverImageUploader from '@/components/admin/post/CoverImageUploader'

import MarkdownEditor from '@/components/admin/editor/MarkdownEditor'
import TurndownService from 'turndown'

export default function EditPostPage() {
  const router = useRouter()
  const params = useParams()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [categories, setCategories] = useState<{ _id: string, title: string }[]>([])
  const [coverImageUrl, setCoverImageUrl] = useState<string>('')
  
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    body: '', // This will now store Markdown
    categoryId: '',
    mainImageAssetId: '',
    publishedAt: '',
    language: 'en'
  })

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
                    // Convert old HTML to Markdown
                    const turndownService = new TurndownService()
                    bodyMarkdown = turndownService.turndown(p.bodyHtml)
                } else if (Array.isArray(p.body)) {
                    // Very rough fallback for portable text
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    bodyMarkdown = p.body.map((b: any) => b.children?.map((c: any) => c.text).join('')).join('\n\n')
                }

                // Get cover image URL if exists
                // Note: The API currently returns mainImage object, we might need to resolve it or it's already expanded?
                // Standard fetch expands references if configured, but let's check. 
                // We'll assume we can get a URL from it or we need to construct it.
                // Actually, let's use the asset ID for now.
                let initialCoverUrl = ''
                if (p.mainImage?.asset) {
                    // We can construct a URL or fetch it. For simplicity in edit page, 
                    // we can use a helper or just assume the asset object has url if we expanded it in GROQ.
                    // Let's rely on our upload handler to give us a URL for preview, 
                    // and for initial load, we might need to use the Sanity CDN pattern.
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
                    title: p.title,
                    slug: p.slug?.current || '',
                    body: bodyMarkdown,
                    categoryId: p.categories?.[0]?._ref || '',
                    mainImageAssetId: p.mainImage?.asset?._ref || '',
                    publishedAt: p.publishedAt ? p.publishedAt.slice(0, 16) : new Date().toISOString().slice(0, 16),
                    language: p.language || 'en'
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
      // Reuse the existing upload logic but tailored for cover image
      // We upload to Sanity and get an asset ID back
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
      
      // Update state
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        title: formData.title,
        slug: { _type: 'slug', current: formData.slug },
        bodyMarkdown: formData.body, // Save to new markdown field
        bodyHtml: '', // Clear HTML field to avoid confusion
        body: [], // Clear standard body
        publishedAt: new Date(formData.publishedAt).toISOString(),
        language: formData.language,
        // Only update category if selected
        ...(formData.categoryId ? { categories: [{ _type: 'reference', _ref: formData.categoryId }] } : {}),
        // Update main image if changed
        ...(formData.mainImageAssetId ? {
            mainImage: {
                _type: 'image',
                asset: { _type: 'reference', _ref: formData.mainImageAssetId },
                alt: formData.title
            }
        } : {})
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

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
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
