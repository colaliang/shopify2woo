'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Tag, FileText, Settings, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import supabase from '@/lib/supabase'

interface Post {
  _id: string
  title: string
  slug: { current: string }
  publishedAt: string
  categories: string[]
}

export default function ContentDashboard() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPosts()
  }, [])

  async function fetchPosts() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/api/admin/content/posts', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      if (!res.ok) throw new Error('Failed to fetch posts')
      const data = await res.json()
      setPosts(data.posts || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this post?')) return
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`/api/admin/content/posts/${id}`, { 
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      if (!res.ok) throw new Error('Failed to delete')
      fetchPosts()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-2xl font-bold text-gray-900">Content Management</h1>
            <p className="text-gray-500 text-sm mt-1">Manage blog posts, categories and site settings.</p>
        </div>
        <div className="flex gap-2">
            <Link 
                href="/studio"
                target="_blank"
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
                title="Open full Sanity Studio for advanced editing"
            >
                <ExternalLink className="w-4 h-4" />
                Open Studio
            </Link>
            <Link 
                href="/admin/content/settings"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
                <Settings className="w-4 h-4" />
                Site Settings
            </Link>
            <Link 
                href="/admin/content/categories"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
                <Tag className="w-4 h-4" />
                Categories
            </Link>
            <Link 
                href="/admin/content/posts/new"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
                <Plus className="w-4 h-4" />
                New Post
            </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-100">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
            <p className="text-gray-500">Loading posts...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Published</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categories</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {posts.length === 0 ? (
                <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        No posts found. Create your first one!
                    </td>
                </tr>
              ) : posts.map((post) => (
                <tr key={post._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{post.title}</div>
                    <div className="text-xs text-gray-500">/{post.slug?.current}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      Published
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : 'Draft'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {post.categories?.join(', ') || '-'}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link
                      href={`/admin/content/posts/${post._id}`}
                      className="inline-flex p-2 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(post._id)}
                      className="inline-flex p-2 text-gray-400 hover:text-red-600 transition-colors"
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
      )}
    </div>
  )
}
