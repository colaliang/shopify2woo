'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Save, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function EditPostPage() {
  const router = useRouter()
  const params = useParams()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [categories, setCategories] = useState<{ _id: string, title: string }[]>([]) // Removed unused state warning if categories were used
  
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    body: '',
    categoryId: '',
  })

  useEffect(() => {
    const id = params?.id
    if (!id) return

    Promise.all([
        fetch('/api/admin/content/categories').then(r => r.json()),
        fetch(`/api/admin/content/posts/${id}`).then(r => r.json())
    ]).then(([catData, postData]) => {
        setCategories(catData.categories || [])
        
        if (postData.post) {
            const p = postData.post
            // Extract text from portable text blocks roughly
            let bodyText = ''
            if (Array.isArray(p.body)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                bodyText = p.body.map((b: any) => b.children?.map((c: any) => c.text).join('')).join('\n\n')
            }

            setFormData({
                title: p.title,
                slug: p.slug?.current || '',
                body: bodyText,
                categoryId: p.categories?.[0]?._ref || '' // Simplified for single category
            })
        }
    }).catch(console.error)
    .finally(() => setFetching(false))
  }, [params?.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      // Reconstruct simplified portable text
      const blocks = formData.body.split('\n\n').map(para => ({
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: para }],
        markDefs: []
      }))

      const payload = {
        title: formData.title,
        slug: { _type: 'slug', current: formData.slug },
        body: blocks,
        // Only update category if selected
        ...(formData.categoryId ? { categories: [{ _type: 'reference', _ref: formData.categoryId }] } : {})
      }

      const res = await fetch(`/api/admin/content/posts/${params?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/content" className="flex items-center text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Posts
        </Link>
        <h1 className="text-2xl font-bold">Edit Post</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
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
                Update Post
            </button>
        </div>
      </form>
    </div>
  )
}
