'use client'

import { useState, useEffect } from 'react'
import { Save, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function SiteSettingsPage() {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    defaultSeo: {
        metaTitle: '',
        metaDescription: ''
    },
    baiduVerification: '',
    googleVerification: '',
    googleAnalyticsId: ''
  })

  useEffect(() => {
    fetch('/api/admin/content/settings')
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
            setFormData({
                title: data.settings.title || '',
                description: data.settings.description || '',
                defaultSeo: {
                    metaTitle: data.settings.defaultSeo?.metaTitle || '',
                    metaDescription: data.settings.defaultSeo?.metaDescription || ''
                },
                baiduVerification: data.settings.baiduVerification || '',
                googleVerification: data.settings.googleVerification || '',
                googleAnalyticsId: data.settings.googleAnalyticsId || ''
            })
        }
      })
      .catch(console.error)
      .finally(() => setFetching(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/admin/content/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!res.ok) throw new Error('Failed to save settings')
      alert('Settings saved successfully!')
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  if (fetching) return <div className="p-8 text-center">Loading settings...</div>

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/content" className="flex items-center text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Site Settings</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Settings */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2">General</h2>
            <div className="grid gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Site Title</label>
                    <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Site Description</label>
                    <textarea 
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                    ></textarea>
                </div>
            </div>
        </div>

        {/* SEO Settings */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2">Default SEO</h2>
            <div className="grid gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Meta Title</label>
                    <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={formData.defaultSeo.metaTitle}
                        onChange={e => setFormData({ 
                            ...formData, 
                            defaultSeo: { ...formData.defaultSeo, metaTitle: e.target.value } 
                        })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Meta Description</label>
                    <textarea 
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={formData.defaultSeo.metaDescription}
                        onChange={e => setFormData({ 
                            ...formData, 
                            defaultSeo: { ...formData.defaultSeo, metaDescription: e.target.value } 
                        })}
                    ></textarea>
                </div>
            </div>
        </div>

        {/* Integration Settings */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2">Integrations</h2>
            <div className="grid gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Google Analytics ID (GA4)</label>
                    <input 
                        type="text" 
                        placeholder="G-XXXXXXXXXX"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                        value={formData.googleAnalyticsId}
                        onChange={e => setFormData({ ...formData, googleAnalyticsId: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Google Verification Code</label>
                    <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                        value={formData.googleVerification}
                        onChange={e => setFormData({ ...formData, googleVerification: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Baidu Verification Code</label>
                    <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                        value={formData.baiduVerification}
                        onChange={e => setFormData({ ...formData, baiduVerification: e.target.value })}
                    />
                </div>
            </div>
        </div>

        <div className="flex justify-end pt-4">
            <button 
                type="submit" 
                disabled={loading}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
            </button>
        </div>
      </form>
    </div>
  )
}
