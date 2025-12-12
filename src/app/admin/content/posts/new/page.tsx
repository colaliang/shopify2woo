'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Save, ArrowLeft, Loader2, Image as ImageIcon, Trash2, Sparkles, Globe, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import supabase from '@/lib/supabase'
import MarkdownEditor from '@/components/admin/editor/MarkdownEditor'
import AiContentPreview from '@/components/admin/ai/AiContentPreview'
import { languages } from '@/sanity/lib/languages'

import LanguageSelector from '@/components/admin/LanguageSelector'

interface AiResult {
  title?: string
  slug?: string
  body?: string
  excerpt?: string
  tags?: string[]
  keyTakeaways?: string[]
  faq?: { question: string; answer: string }[]
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
  const [translating, setTranslating] = useState(false)
  const [categories, setCategories] = useState<{ _id: string, title: string }[]>([])
  const [activeTab, setActiveTab] = useState<'content' | 'seo' | 'settings' | 'ai'>('content')
  
  // Language State
  const [contentLang, setContentLang] = useState('en')
  // const [autoTranslate, setAutoTranslate] = useState(true) // Removed
  const [showTranslateModal, setShowTranslateModal] = useState(false)
  
  const [formData, setFormData] = useState({
    title: { en: '' } as Record<string, string>,
    slug: '',
    body: { en: '' } as Record<string, string>,
    excerpt: { en: '' } as Record<string, string>,
    categoryId: '',
    mainImageAssetId: '',
    mainImage: { en: null } as Record<string, string | null>, // Store asset IDs per language
    alt: { en: '' } as Record<string, string>,
    tags: [] as string[],
    keyTakeaways: { en: [] } as Record<string, string[]>,
    faq: { en: [] } as Record<string, { question: string; answer: string }[]>,
    schemaType: 'BlogPosting',
    seo: {
        metaTitle: { en: '' } as Record<string, string>,
        metaDescription: { en: '' } as Record<string, string>,
        focusKeyword: '',
        keywords: { en: [] } as Record<string, string[]>,
        noIndex: false,
        noFollow: false
    },
    openGraph: {
        title: { en: '' } as Record<string, string>,
        description: { en: '' } as Record<string, string>
    },
    publishedAt: new Date().toISOString().slice(0, 16),
  })

  // Undo/Redo State
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const addToHistory = (newState: typeof formData) => {
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(JSON.parse(JSON.stringify(newState)))
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
  }

  const undo = () => {
      if (historyIndex > 0) {
          setHistoryIndex(historyIndex - 1)
          setFormData(history[historyIndex - 1])
      }
  }

  // Initialize history
  useEffect(() => {
      if (history.length === 0 && formData.title.en) {
          addToHistory(formData)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.title.en]) // Only init when data is modified

  // AI Generation State
  const [aiConfig, setAiConfig] = useState({
      title: '',
      keywords: '',
      requirements: ''
  })
  const [aiResult, setAiResult] = useState<AiResult | null>(null)
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

  // When changing language, update cover image preview if available
  useEffect(() => {
      const assetId = formData.mainImage[contentLang] || formData.mainImage.en
      if (assetId) {
          // Reconstruct URL (a bit hacky, but avoids fetching asset details again)
          const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
          const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
          const [, id, dim, ext] = assetId.split('-')
          setPreviewImage(`https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dim}.${ext}`)
      } else {
          setPreviewImage(null)
      }
  }, [contentLang, formData.mainImage])

  useEffect(() => {
      const cached = localStorage.getItem('admin_ai_generated_content')
      if (cached) {
          try {
              const parsed = JSON.parse(cached)
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
                  language: 'en' // Always generate in English first
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
            parsedContent = JSON.parse(data.content);
            bodyContent = parsedContent.body || '';
          } catch (e) {
            console.warn('AI output is not valid JSON, using raw string', e);
            bodyContent = data.content || '';
            parsedContent = { body: bodyContent };
          }

          setAiOutput(bodyContent)
          setAiResult(parsedContent)
          
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
      const title = content.title || aiConfig.title || formData.title.en;

      // Update form data with AI content (Default to English)
      setFormData(prev => ({
          ...prev,
          title: { ...prev.title, en: title },
          slug: content.slug || generateSlug(title),
          body: { ...prev.body, en: body },
          excerpt: { ...prev.excerpt, en: content.excerpt || prev.excerpt.en },
          tags: content.tags || prev.tags,
          keyTakeaways: { ...prev.keyTakeaways, en: content.keyTakeaways || prev.keyTakeaways.en },
          faq: { ...prev.faq, en: content.faq || prev.faq.en },
          schemaType: content.seo?.schemaType || prev.schemaType,
          seo: {
              ...prev.seo,
              metaTitle: { ...prev.seo.metaTitle, en: content.seo?.metaTitle || title },
              metaDescription: { ...prev.seo.metaDescription, en: content.seo?.metaDescription || body.replace(/<[^>]*>/g, '').slice(0, 150) + '...' },
              focusKeyword: content.seo?.focusKeyword || prev.seo.focusKeyword,
              keywords: content.seo?.keywords ? { ...prev.seo.keywords, en: content.seo.keywords } : prev.seo.keywords,
              noIndex: content.seo?.noIndex !== undefined ? content.seo.noIndex : prev.seo.noIndex,
              noFollow: content.seo?.noFollow !== undefined ? content.seo.noFollow : prev.seo.noFollow,
          },
          openGraph: {
              ...prev.openGraph,
              title: { ...prev.openGraph.title, en: content.openGraph?.title || content.seo?.metaTitle || title },
              description: { ...prev.openGraph.description, en: content.openGraph?.description || content.seo?.metaDescription || prev.openGraph.description.en }
          }
      }))
      
      localStorage.removeItem('admin_ai_generated_content')
      setActiveTab('content')
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0]
      if (!file) return

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
          // setFormData(prev => ({ ...prev, mainImageAssetId: data.asset._id }))
          
          // Update localized image map
          setFormData(prev => ({
              ...prev,
              mainImageAssetId: contentLang === 'en' ? data.asset._id : prev.mainImageAssetId,
              mainImage: {
                  ...prev.mainImage,
                  [contentLang]: data.asset._id
              }
          }))
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
    return data.asset.url
  }

  async function handleTranslate(targetLangs: string[]) {
      if (!formData.title.en || !formData.body.en) {
          alert('Please enter English title and content first.')
          return
      }
      
      setTranslating(true)
      
      // Save current state to history before translating
      addToHistory(formData)

      try {
          const { data: { session } } = await supabase.auth.getSession()
          const token = session?.access_token
          
          const res = await fetch('/api/admin/ai/translate', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                  content: {
                      title: formData.title.en,
                      body: formData.body.en,
                      excerpt: formData.excerpt.en,
                      keyTakeaways: formData.keyTakeaways.en,
                      faq: formData.faq.en,
                      // Also translate keywords
                      keywords: formData.seo.keywords.en
                  },
                  sourceLang: 'en',
                  targetLangs
              })
          })

          if (res.ok) {
              const { translations } = await res.json()
              
              const newFormData = { ...formData }
              
              // Merge translations
              targetLangs.forEach(lang => {
                  if (translations[lang]) {
                      const t = translations[lang]
                      
                      // Always overwrite if explicitly requested
                      newFormData.title[lang] = t.title
                      newFormData.body[lang] = t.body
                      newFormData.excerpt[lang] = t.excerpt
                      newFormData.keyTakeaways[lang] = t.keyTakeaways
                      newFormData.faq[lang] = t.faq
                      
                      // Also translate Image Alt
                      newFormData.alt[lang] = t.title

                      // SEO fields
                      newFormData.seo.metaTitle[lang] = t.title
                      newFormData.seo.metaDescription[lang] = t.excerpt
                      newFormData.openGraph.title[lang] = t.title
                      newFormData.openGraph.description[lang] = t.excerpt

                      // Translate Keywords
                      if (t.keywords) {
                          newFormData.seo.keywords[lang] = t.keywords
                      }
                  }
              })
              
              setFormData(newFormData)
              addToHistory(newFormData)
              setShowTranslateModal(false)
              alert(`Successfully translated to ${targetLangs.length} languages. Review changes before saving.`)
          } else {
              throw new Error('Translation API failed')
          }
      } catch (err) {
          console.error('Translation failed', err)
          alert('Translation failed. Please try again.')
      } finally {
          setTranslating(false)
      }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const finalFormData = { ...formData }

      // 2. Prepare Payload
      // Sanity expects localized fields as: { en: "...", zh_CN: "..." }
      // Our state keys are like "zh-CN", we need to convert to Sanity keys (underscore)
      const toSanityKey = (lang: string) => lang.replace(/-/g, '_')
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const localize = (data: Record<string, any>) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res: Record<string, any> = {}
          languages.forEach(lang => {
              const val = data[lang.id] // Remove fallback to EN
              if (val) res[toSanityKey(lang.id)] = val
          })
          return res
      }

      const payload = {
        // Legacy fields for backward compatibility
        title: finalFormData.title.en,
        bodyMarkdown: finalFormData.body.en,
        excerpt: finalFormData.excerpt.en,

        localizedTitle: localize(finalFormData.title),
        slug: { _type: 'slug', current: finalFormData.slug || generateSlug(finalFormData.title.en) },
        localizedBodyMarkdown: localize(finalFormData.body),
        localizedExcerpt: localize(finalFormData.excerpt),
        
        categories: finalFormData.categoryId ? [{ _type: 'reference', _ref: finalFormData.categoryId, _key: Math.random().toString(36).substring(7) }] : [],
        tags: finalFormData.tags,
        
        localizedKeyTakeaways: localize(finalFormData.keyTakeaways),
        localizedFaq: localize(finalFormData.faq),
        
        publishedAt: new Date(finalFormData.publishedAt).toISOString(),
        schemaType: finalFormData.schemaType,
        
        // Image
        ...(finalFormData.mainImageAssetId ? {
            mainImage: {
                _type: 'image',
                asset: { _type: 'reference', _ref: finalFormData.mainImageAssetId },
                alt: finalFormData.alt.en || finalFormData.title.en, // Legacy field
                localizedAlt: localize(finalFormData.alt) // New localized field
            },
            localizedMainImage: Object.keys(finalFormData.mainImage).reduce((acc, lang) => {
                 const assetId = finalFormData.mainImage[lang]
                 if (assetId) {
                     acc[toSanityKey(lang)] = {
                         _type: 'image',
                         asset: { _type: 'reference', _ref: assetId },
                         alt: finalFormData.alt[lang]
                     }
                 }
                 return acc
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }, {} as Record<string, any>),
        } : {}),

        // SEO
        seo: {
            _type: 'seo',
            metaTitleLocalized: localize(finalFormData.seo.metaTitle),
            metaDescriptionLocalized: localize(finalFormData.seo.metaDescription),
            focusKeyword: finalFormData.seo.focusKeyword,
            keywords: finalFormData.seo.keywords.en, // Legacy
            localizedKeywords: localize(finalFormData.seo.keywords), // New localized
            noIndex: finalFormData.seo.noIndex,
            noFollow: finalFormData.seo.noFollow
        },

        // OpenGraph
        openGraph: {
            _type: 'openGraph',
            titleLocalized: localize(finalFormData.openGraph.title),
            descriptionLocalized: localize(finalFormData.openGraph.description),
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
      // setTranslating(false)
    }
  }

  const handleNestedChange = (
    category: 'seo' | 'openGraph', 
    field: string, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ) => {
    setFormData(prev => ({
        ...prev,
        [category]: {
            ...prev[category],
            [field]: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(prev[category] as any)[field],
                [contentLang]: value
            }
        }
    }))
  }

  return (
    <div className="p-8 w-full max-w-full">
      <LanguageSelector 
        isOpen={showTranslateModal} 
        onClose={() => setShowTranslateModal(false)}
        onConfirm={handleTranslate}
        isTranslating={translating}
      />

      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/content" className="flex items-center text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Posts
        </Link>
        <div className="flex items-center gap-2">
            {historyIndex > 0 && (
                <button 
                    onClick={undo}
                    type="button"
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 px-3 py-1 bg-white border rounded shadow-sm"
                    title="Undo last action"
                >
                    <RotateCcw className="w-4 h-4 mr-1" /> Undo
                </button>
            )}
            <h1 className="text-2xl font-bold ml-2">New Post</h1>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <div className="flex gap-4 border-b border-gray-200">
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
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
        
        {/* Language Tabs for Content/SEO */}
        {(activeTab === 'content' || activeTab === 'seo') && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {languages.map(lang => (
                    <button
                        key={lang.id}
                        type="button"
                        onClick={() => setContentLang(lang.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
                            contentLang === lang.id
                            ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-500'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        {lang.title}
                        {lang.id === 'en' && ' (Default)'}
                    </button>
                ))}
            </div>
        )}

        {/* CONTENT TAB */}
        {activeTab === 'content' && (
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Title ({languages.find(l => l.id === contentLang)?.title})
                    </label>
                    <input 
                        type="text" 
                        required={contentLang === 'en'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.title[contentLang] || ''}
                        onChange={e => {
                            const val = e.target.value;
                            setFormData(prev => ({
                                ...prev,
                                title: { ...prev.title, [contentLang]: val },
                                slug: contentLang === 'en' ? generateSlug(val) : prev.slug
                            }))
                        }}
                    />
                </div>

                {contentLang === 'en' && (
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
                )}

                {contentLang === 'en' && (
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
                        <div className="mt-2">
                             <label className="block text-xs font-medium text-gray-500 mb-1">
                                 Alt Text ({languages.find(l => l.id === contentLang)?.title})
                             </label>
                             <input 
                                 type="text" 
                                 className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                                 placeholder="Describe image for SEO"
                                 value={formData.alt[contentLang] || ''}
                                 onChange={e => setFormData(prev => ({
                                     ...prev,
                                     alt: { ...prev.alt, [contentLang]: e.target.value }
                                 }))}
                             />
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Excerpt ({languages.find(l => l.id === contentLang)?.title})
                    </label>
                    <textarea 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm font-mono"
                        rows={3}
                        value={formData.excerpt[contentLang] || ''}
                        onChange={e => setFormData(prev => ({
                            ...prev,
                            excerpt: { ...prev.excerpt, [contentLang]: e.target.value }
                        }))}
                        placeholder="Short summary for list views and SEO."
                    />
                </div>

                {contentLang === 'en' && (
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
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Content ({languages.find(l => l.id === contentLang)?.title})
                    </label>
                    <MarkdownEditor 
                        content={formData.body[contentLang] || ''}
                        onChange={(md) => setFormData(prev => ({
                            ...prev,
                            body: { ...prev.body, [contentLang]: md }
                        }))}
                        onImageUpload={handleEditorImageUpload}
                    />
                </div>
            </div>
        )}

        {/* SEO TAB */}
        {activeTab === 'seo' && (
            <div className="space-y-6">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SEO Title ({languages.find(l => l.id === contentLang)?.title})</label>
                    <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder={formData.title[contentLang]}
                        value={formData.seo.metaTitle[contentLang] || ''}
                        onChange={e => handleNestedChange('seo', 'metaTitle', e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave blank to use post title.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Meta Description ({languages.find(l => l.id === contentLang)?.title})</label>
                    <textarea 
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={formData.seo.metaDescription[contentLang] || ''}
                        onChange={e => handleNestedChange('seo', 'metaDescription', e.target.value)}
                    ></textarea>
                </div>
                
                {contentLang === 'en' && (
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
                )}
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Keywords ({languages.find(l => l.id === contentLang)?.title})
                    </label>
                    <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="Comma separated keywords"
                        value={(formData.seo.keywords[contentLang] || []).join(', ')}
                        onChange={e => setFormData(prev => ({ 
                            ...prev, 
                            seo: { 
                                ...prev.seo, 
                                keywords: {
                                    ...prev.seo.keywords,
                                    [contentLang]: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                                }
                            } 
                        }))}
                    />
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

        <div className="flex flex-col gap-4 justify-end pt-4 border-t">
            {activeTab !== 'ai' && (
                <div className="flex justify-end">
                    <button 
                        type="button"
                        onClick={() => setShowTranslateModal(true)}
                        className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 px-3 py-2 rounded-lg border border-gray-200 transition-colors"
                    >
                        <Globe className="w-4 h-4 text-blue-500" />
                        <span>Translate to other languages...</span>
                    </button>
                </div>
            )}

            <div className="flex justify-end">
                <button 
                    type="submit" 
                    disabled={loading || translating}
                    className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading || translating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Publish Post
                </button>
            </div>
        </div>
      </form>
    </div>
  )
}
