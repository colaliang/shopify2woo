'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, ArrowLeft, Edit } from 'lucide-react'
import Link from 'next/link'
import supabase from '@/lib/supabase'
import { languages } from '@/sanity/lib/languages'

interface Category {
  _id: string
  title: string
  slug: { current: string }
  description?: string
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  // const [error, setError] = useState('')
  const [newCategory, setNewCategory] = useState({ title: '', description: '' })
  const [autoTranslate, setAutoTranslate] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/api/admin/content/categories', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      if (!res.ok) throw new Error('Failed to fetch categories')
      const data = await res.json()
      setCategories(data.categories || [])
    } catch (e) {
      // setError(e instanceof Error ? e.message : String(e))
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateOrUpdate(e: React.FormEvent) {
    e.preventDefault()
    setIsCreating(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const slug = newCategory.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
      
      const method = editingId ? 'PUT' : 'POST'
      const body = {
        _id: editingId,
        title: newCategory.title,
        description: newCategory.description,
        slug: { _type: 'slug', current: slug },
        autoTranslate
      }

      const res = await fetch('/api/admin/content/categories', {
        method,
        headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      })

      if (!res.ok) throw new Error(`Failed to ${editingId ? 'update' : 'create'} category`)
      const data = await res.json()
      
      setNewCategory({ title: '', description: '' })
      setEditingId(null)
      setAutoTranslate(true) // Reset auto translate to true

      if (data.category) {
        if (editingId) {
            setCategories(prev => prev.map(c => c._id === editingId ? data.category : c).sort((a, b) => a.title.localeCompare(b.title)))
        } else {
            setCategories(prev => [...prev, data.category].sort((a, b) => a.title.localeCompare(b.title)))
        }
      } else {
          fetchCategories()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setIsCreating(false)
    }
  }

  function startEdit(cat: Category) {
      setNewCategory({ title: cat.title, description: cat.description || '' })
      setEditingId(cat._id)
      setAutoTranslate(true) // Default to true when editing too
  }

  function cancelEdit() {
      setNewCategory({ title: '', description: '' })
      setEditingId(null)
      setAutoTranslate(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this category?')) return
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`/api/admin/content/categories/${id}`, { 
          method: 'DELETE',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      if (!res.ok) throw new Error('Failed to delete')
      fetchCategories()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="p-8 w-full max-w-full">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/content" className="flex items-center text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Categories</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create/Edit Form */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6 h-fit">
            <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit Category' : 'Add New Category'}</h2>
            <form onSubmit={handleCreateOrUpdate} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input 
                        type="text" 
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={newCategory.title}
                        onChange={e => setNewCategory({ ...newCategory, title: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea 
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={newCategory.description}
                        onChange={e => setNewCategory({ ...newCategory, description: e.target.value })}
                    ></textarea>
                </div>
                
                {/* Language Support Info */}
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    <p className="font-medium mb-1">Supported Languages:</p>
                    <div className="flex flex-wrap gap-1">
                        {languages.filter(l => l.id !== 'en').map(l => (
                            <span key={l.id} className="bg-gray-200 px-1.5 py-0.5 rounded text-gray-700">
                                {l.title.split(' ')[0]}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex items-center">
                    <input
                        id="autoTranslate"
                        type="checkbox"
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        checked={autoTranslate}
                        onChange={e => setAutoTranslate(e.target.checked)}
                    />
                    <label htmlFor="autoTranslate" className="ml-2 block text-sm text-gray-900">
                        {editingId ? 'Update translations for all languages' : 'Auto translate to multi-language'}
                    </label>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        type="submit" 
                        disabled={isCreating}
                        className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {editingId ? <Edit className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                        {editingId ? 'Update' : 'Add'}
                    </button>
                    {editingId && (
                        <button 
                            type="button"
                            onClick={cancelEdit}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </form>
        </div>

        {/* List */}
        <div className="md:col-span-2 bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {loading ? (
                        <tr>
                            <td colSpan={3} className="px-6 py-4 text-center text-gray-500">Loading...</td>
                        </tr>
                    ) : categories.length === 0 ? (
                        <tr>
                            <td colSpan={3} className="px-6 py-4 text-center text-gray-500">No categories found.</td>
                        </tr>
                    ) : categories.map((cat) => (
                        <tr key={cat._id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                                <div className="font-medium text-gray-900">{cat.title}</div>
                                {cat.description && <div className="text-xs text-gray-500 truncate max-w-xs">{cat.description}</div>}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                                {cat.slug?.current}
                            </td>
                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                <button
                                    onClick={() => startEdit(cat)}
                                    className="text-gray-400 hover:text-blue-600 transition-colors"
                                    title="Edit"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(cat._id)}
                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  )
}
