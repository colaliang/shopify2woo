'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Save, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function NewPostPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<{ _id: string, title: string }[]>([])
  
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    body: '', // We will treat this as simple text for MVP, or create a basic block
    categoryId: '',
  })

  useEffect(() => {
    // Fetch categories
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        title: formData.title,
        slug: { _type: 'slug', current: formData.slug || generateSlug(formData.title) },
        // Construct a simple Portable Text block
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
        publishedAt: new Date().toISOString()
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

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
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
