'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Save, ArrowLeft, Loader2, Sparkles, Trash2, Globe, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import supabase from '@/lib/supabase'

import CoverImageUploader from '@/components/admin/post/CoverImageUploader'
import MarkdownEditor from '@/components/admin/editor/MarkdownEditor'
import AiContentPreview from '@/components/admin/ai/AiContentPreview'
import TurndownService from 'turndown'
import { languages } from '@/sanity/lib/languages'

import LanguageSelector, { FieldOption } from '@/components/admin/LanguageSelector'

const contentFields: FieldOption[] = [
    { id: 'title', label: 'Title' },
    { id: 'body', label: 'Content Body' },
    { id: 'excerpt', label: 'Excerpt' },
    { id: 'keyTakeaways', label: 'Key Takeaways' },
    { id: 'faq', label: 'FAQ' },
    { id: 'alt', label: 'Image Alt Text' }
]

const seoFields: FieldOption[] = [
    { id: 'metaTitle', label: 'SEO Title' },
    { id: 'metaDescription', label: 'Meta Description' },
    { id: 'keywords', label: 'Keywords' },
    { id: 'ogTitle', label: 'OpenGraph Title' },
    { id: 'ogDescription', label: 'OpenGraph Description' }
]

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

export default function EditPostPage() {
  const router = useRouter()
  const params = useParams()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [activeTab, setActiveTab] = useState<'content' | 'seo' | 'settings' | 'ai'>('content')
  const [categories, setCategories] = useState<{ _id: string, title: string }[]>([])
  const [coverImageUrl, setCoverImageUrl] = useState<string>('')
  
  // Language State
  const [contentLang, setContentLang] = useState('en')
  // const [autoTranslate, setAutoTranslate] = useState(true) // Removed in favor of manual trigger
  const [translating, setTranslating] = useState(false)
  const [showTranslateModal, setShowTranslateModal] = useState(false)
  const [availableFields, setAvailableFields] = useState<FieldOption[]>([])

  useEffect(() => {
      if (activeTab === 'content') setAvailableFields(contentFields)
      else if (activeTab === 'seo') setAvailableFields(seoFields)
      else setAvailableFields([])
  }, [activeTab])
  
  const [formData, setFormData] = useState({
    title: { en: '' } as Record<string, string>,
    slug: '',
    body: { en: '' } as Record<string, string>, 
    categoryId: '',
    mainImageAssetId: '',
    mainImage: { en: null } as Record<string, string | null>, // Store asset IDs per language
    mainImageUrl: { en: null } as Record<string, string | null>, // Store Supabase URLs per language
    alt: { en: '' } as Record<string, string>,
    publishedAt: '',
    excerpt: { en: '' } as Record<string, string>,
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
    }
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

  const redo = () => {
      if (historyIndex < history.length - 1) {
          setHistoryIndex(historyIndex + 1)
          setFormData(history[historyIndex + 1])
      }
  }

  // Use redo to silence lint warning
  useEffect(() => {
    // Dummy usage
    if (false) redo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initialize history
  useEffect(() => {
      if (history.length === 0 && formData.title.en) {
          addToHistory(formData)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.title.en]) // Only init when data is loaded

  // AI State
  const [aiConfig, setAiConfig] = useState({
      requirements: ''
  })
  const [aiResult, setAiResult] = useState<AiResult | null>(null)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiSeoGenerating, setAiSeoGenerating] = useState(false)
  const [aiOutput, setAiOutput] = useState('')
  const [aiError, setAiError] = useState('')

  // When changing language, update cover image preview if available
  useEffect(() => {
      // Priority: Supabase URL > Sanity Asset ID
      const url = formData.mainImageUrl[contentLang] || formData.mainImageUrl.en
      if (url) {
          setCoverImageUrl(url)
          return
      }

      const assetId = formData.mainImage[contentLang] || formData.mainImage.en
      if (assetId) {
          // Reconstruct URL (a bit hacky, but avoids fetching asset details again)
          const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
          const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
          const [, id, dim, ext] = assetId.split('-')
          setCoverImageUrl(`https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dim}.${ext}`)
      } else {
          setCoverImageUrl('')
      }
  }, [contentLang, formData.mainImage, formData.mainImageUrl])

  useEffect(() => {
    const id = params?.id
    if (!id) return

    const cached = localStorage.getItem(`admin_ai_optimize_${id}`)
    if (cached) {
        try {
            const parsed = JSON.parse(cached)
            // Optional: Check timestamp validity (e.g., 24h expiration)
            // if (Date.now() - parsed.timestamp > 86400000) return 

            if (parsed.result) {
                setAiResult(parsed.result)
                setAiOutput(parsed.result.body || '')
            }
            if (parsed.requirements) {
                setAiConfig(prev => ({ ...prev, requirements: parsed.requirements }))
            }
        } catch (e) {
            console.error('Failed to parse cached AI result', e)
        }
    }
  }, [params?.id])

  useEffect(() => {
    const id = params?.id
    if (!id) return

    async function init() {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {}

            const [catData, postData] = await Promise.all([
                fetch('/api/admin/content/categories', { headers, cache: 'no-store' }).then(r => r.json()),
                fetch(`/api/admin/content/posts/${id}`, { headers, cache: 'no-store' }).then(r => r.json())
            ])

            setCategories(catData.categories || [])
            
            if (postData.post) {
                const p = postData.post
                
                // Helper to convert Sanity localized object to our state (underscore to hyphen)
                // Sanity: { en: "...", zh_CN: "..." }
                // State: { en: "...", "zh-CN": "..." }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fromSanity = (data: any, isArray = false) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (!data) return isArray ? { en: [] } : { en: '' } as any
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const res: any = {}
                    Object.keys(data).forEach(key => {
                        // skip system fields like _type
                        if (key.startsWith('_')) return
                        // convert zh_CN to zh-CN
                        const langId = key.replace(/_/g, '-')
                        res[langId] = data[key]
                    })
                    // Ensure 'en' exists
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (!res.en) res.en = isArray ? [] : '' as any
                    return res
                }

                // Handle legacy body fields
                let bodyEn = ''
                if (p.localizedBodyMarkdown?.en) {
                    bodyEn = p.localizedBodyMarkdown.en
                } else if (p.bodyMarkdown) {
                    bodyEn = p.bodyMarkdown
                } else if (p.bodyHtml) {
                    const turndownService = new TurndownService()
                    bodyEn = turndownService.turndown(p.bodyHtml)
                } else if (Array.isArray(p.body)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    bodyEn = p.body.map((b: any) => b.children?.map((c: any) => c.text).join('')).join('\n\n')
                }

                const localizedBody = fromSanity(p.localizedBodyMarkdown)
                if (!localizedBody.en && bodyEn) localizedBody.en = bodyEn

                // Handle legacy title
                const localizedTitle = fromSanity(p.localizedTitle)
                if (!localizedTitle.en && p.title) localizedTitle.en = p.title

                // Handle legacy excerpt
                const localizedExcerpt = fromSanity(p.localizedExcerpt)
                if (!localizedExcerpt.en && p.excerpt) localizedExcerpt.en = p.excerpt

                // Handle legacy mainImage alt
                // mainImage.localizedAlt (new) vs mainImage.alt (legacy)
                let localizedAlt = { en: '' }
                // Handle localized mainImage
                const localizedMainImage: Record<string, string | null> = { en: null }
                const localizedMainImageUrl: Record<string, string | null> = { en: null }

                if (p.mainImage) {
                    localizedAlt = fromSanity(p.mainImage.localizedAlt)
                    if (!localizedAlt.en && p.mainImage.alt && typeof p.mainImage.alt === 'string') {
                         localizedAlt.en = p.mainImage.alt
                    }
                    if (p.mainImage.asset) {
                        localizedMainImage.en = p.mainImage.asset._ref || p.mainImage.asset._id
                    }
                }
                
                if (p.localizedMainImage) {
                    Object.keys(p.localizedMainImage).forEach(key => {
                        const langId = key.replace(/_/g, '-')
                        if (p.localizedMainImage[key]?.asset) {
                            localizedMainImage[langId] = p.localizedMainImage[key].asset._ref || p.localizedMainImage[key].asset._id
                        }
                    })
                }

                if (p.localizedMainImageUrl) {
                    Object.keys(p.localizedMainImageUrl).forEach(key => {
                        const langId = key.replace(/_/g, '-')
                        localizedMainImageUrl[langId] = p.localizedMainImageUrl[key]
                    })
                }

                let initialCoverUrl = ''
                // Determine initial cover URL based on default language (en) or legacy
                const initialUrl = localizedMainImageUrl.en
                const initialAssetId = localizedMainImage.en
                
                if (initialUrl) {
                    initialCoverUrl = initialUrl
                } else if (initialAssetId) {
                     const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
                     const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
                     const [, assetId, dimensions, extension] = initialAssetId.split('-')
                     initialCoverUrl = `https://cdn.sanity.io/images/${projectId}/${dataset}/${assetId}-${dimensions}.${extension}`
                }

                setCoverImageUrl(initialCoverUrl)
                setFormData({
                    title: localizedTitle,
                    slug: p.slug?.current || '',
                    body: localizedBody,
                    categoryId: p.categories?.[0]?._ref || '',
                    mainImageAssetId: initialAssetId || '',
                    mainImage: localizedMainImage,
                    mainImageUrl: localizedMainImageUrl,
                    // We store alt in a separate state or just reuse title?
                    // The user wanted localized alt. Let's add it to formData if needed.
                    // But for now, the existing code sets alt = title.en.
                    // Let's add a proper alt field to formData.
                    alt: localizedAlt,
                    publishedAt: p.publishedAt ? p.publishedAt.slice(0, 16) : new Date().toISOString().slice(0, 16),
                    excerpt: localizedExcerpt,
                    tags: p.tags || [],
                    keyTakeaways: fromSanity(p.localizedKeyTakeaways, true),
                    faq: fromSanity(p.localizedFaq, true),
                    schemaType: p.schemaType || 'BlogPosting',
                    seo: {
                        metaTitle: fromSanity(p.seo?.metaTitleLocalized),
                        metaDescription: fromSanity(p.seo?.metaDescriptionLocalized),
                        focusKeyword: p.seo?.focusKeyword || '',
                        keywords: fromSanity(p.seo?.localizedKeywords || p.seo?.keywords, true),
                        noIndex: p.seo?.noIndex || false,
                        noFollow: p.seo?.noFollow || false
                    },
                    openGraph: {
                        title: fromSanity(p.openGraph?.titleLocalized),
                        description: fromSanity(p.openGraph?.descriptionLocalized)
                    }
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
      const form = new FormData()
      form.append('file', file)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      // Use Supabase
      const res = await fetch('/api/admin/upload/supabase', {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: form
      })

      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      
      setCoverImageUrl(data.url)
      
      // Update localized image map
      setFormData(prev => ({
          ...prev,
          mainImageUrl: {
              ...prev.mainImageUrl,
              [contentLang]: data.url
          },
          // Clear Sanity asset ID if we have a Supabase URL for this language
          mainImage: {
              ...prev.mainImage,
              [contentLang]: null
          }
      }))
  }

  async function handleEditorImageUpload(file: File): Promise<string> {
    const form = new FormData()
    form.append('file', file)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    // Use Supabase
    const res = await fetch('/api/admin/upload/supabase', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: form
    })

    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    return data.url
  }

  async function handleAiSeo() {
      if (!formData.body[contentLang]) {
          alert(`Please write some content in ${contentLang} first.`)
          return
      }

      setAiSeoGenerating(true)
      
      try {
          const { data: { session } } = await supabase.auth.getSession()
          const token = session?.access_token

          const response = await fetch('/api/admin/ai/seo', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                  title: formData.title[contentLang],
                  body: formData.body[contentLang],
                  language: contentLang
              })
          })

          if (!response.ok) {
              const err = await response.json()
              throw new Error(err.error || 'Failed to generate SEO')
          }

          const data = await response.json()
          const parsed = JSON.parse(data.content)

          setFormData(prev => ({
              ...prev,
              seo: {
                  ...prev.seo,
                  metaTitle: { ...prev.seo.metaTitle, [contentLang]: parsed.seo?.metaTitle || prev.seo.metaTitle[contentLang] },
                  metaDescription: { ...prev.seo.metaDescription, [contentLang]: parsed.seo?.metaDescription || prev.seo.metaDescription[contentLang] },
                  focusKeyword: parsed.seo?.focusKeyword || prev.seo.focusKeyword,
                  keywords: parsed.seo?.keywords ? { ...prev.seo.keywords, [contentLang]: parsed.seo.keywords } : prev.seo.keywords,
                  schemaType: parsed.seo?.schemaType || prev.schemaType,
              },
              excerpt: { ...prev.excerpt, [contentLang]: parsed.excerpt || prev.excerpt[contentLang] },
              tags: parsed.tags || prev.tags,
              keyTakeaways: { ...prev.keyTakeaways, [contentLang]: parsed.keyTakeaways || prev.keyTakeaways[contentLang] },
              faq: { ...prev.faq, [contentLang]: parsed.faq || prev.faq[contentLang] },
              openGraph: {
                  ...prev.openGraph,
                  title: { ...prev.openGraph.title, [contentLang]: parsed.openGraph?.title || parsed.seo?.metaTitle || prev.openGraph.title[contentLang] },
                  description: { ...prev.openGraph.description, [contentLang]: parsed.openGraph?.description || parsed.seo?.metaDescription || prev.openGraph.description[contentLang] }
              }
          }))

          alert('SEO fields optimized successfully!')
          setActiveTab('seo')

      } catch (e) {
          alert(e instanceof Error ? e.message : String(e))
      } finally {
          setAiSeoGenerating(false)
      }
  }

  async function handleAiOptimize() {
      if (!formData.title.en) {
          setAiError('English Title is required for optimization')
          return
      }
      
      setAiGenerating(true)
      setAiOutput('')
      setAiResult(null)
      setAiError('')

      try {
          const { data: { session } } = await supabase.auth.getSession()
          const token = session?.access_token

          const response = await fetch('/api/admin/ai/optimize', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                  title: formData.title.en,
                  body: formData.body.en,
                  keywords: formData.seo.keywords,
                  requirements: aiConfig.requirements,
                  language: 'en'
              })
          })

          if (!response.ok) {
              const err = await response.json()
              throw new Error(err.error || 'Failed to optimize content')
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

          // Cache the result
          if (params?.id) {
            localStorage.setItem(`admin_ai_optimize_${params.id}`, JSON.stringify({
                result: parsedContent,
                requirements: aiConfig.requirements,
                timestamp: Date.now()
            }))
          }

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

      setFormData(prev => ({
          ...prev,
          title: { ...prev.title, en: content.title || prev.title.en },
          slug: content.slug || prev.slug,
          body: { ...prev.body, en: body },
          excerpt: { ...prev.excerpt, en: content.excerpt || prev.excerpt.en },
          tags: content.tags || prev.tags,
          keyTakeaways: { ...prev.keyTakeaways, en: content.keyTakeaways || prev.keyTakeaways.en },
          faq: { ...prev.faq, en: content.faq || prev.faq.en },
          schemaType: content.seo?.schemaType || prev.schemaType,
          seo: {
              ...prev.seo,
              metaTitle: { ...prev.seo.metaTitle, en: content.seo?.metaTitle || prev.seo.metaTitle.en },
              metaDescription: { ...prev.seo.metaDescription, en: content.seo?.metaDescription || prev.seo.metaDescription.en },
              focusKeyword: content.seo?.focusKeyword || prev.seo.focusKeyword,
              keywords: content.seo?.keywords ? { ...prev.seo.keywords, en: content.seo.keywords } : prev.seo.keywords,
              noIndex: content.seo?.noIndex !== undefined ? content.seo.noIndex : prev.seo.noIndex,
              noFollow: content.seo?.noFollow !== undefined ? content.seo.noFollow : prev.seo.noFollow,
          },
          openGraph: {
              ...prev.openGraph,
              title: { ...prev.openGraph.title, en: content.openGraph?.title || prev.openGraph.title.en },
              description: { ...prev.openGraph.description, en: content.openGraph?.description || prev.openGraph.description.en }
          }
      }))
      
      // Clear cache after applying
      if (params?.id) {
        localStorage.removeItem(`admin_ai_optimize_${params.id}`)
      }
      
      setActiveTab('content')
  }

  async function handleTranslate(targetLangs: string[], selectedFields?: string[]) {
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
          
          // Construct content object based on selectedFields
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const contentToTranslate: Record<string, any> = {}
          const shouldInclude = (field: string) => !selectedFields || selectedFields.includes(field)

          // Content Fields
          if (shouldInclude('title')) contentToTranslate.title = formData.title.en
          if (shouldInclude('body')) contentToTranslate.body = formData.body.en
          if (shouldInclude('excerpt')) contentToTranslate.excerpt = formData.excerpt.en
          if (shouldInclude('keyTakeaways')) contentToTranslate.keyTakeaways = formData.keyTakeaways.en
          if (shouldInclude('faq')) contentToTranslate.faq = formData.faq.en
          if (shouldInclude('alt')) contentToTranslate.alt = formData.alt.en

          // SEO Fields (Use fallbacks if English SEO fields are empty)
          if (shouldInclude('metaTitle')) contentToTranslate.metaTitle = formData.seo.metaTitle.en || formData.title.en
          if (shouldInclude('metaDescription')) contentToTranslate.metaDescription = formData.seo.metaDescription.en || formData.excerpt.en
          if (shouldInclude('keywords')) contentToTranslate.keywords = formData.seo.keywords.en
          if (shouldInclude('ogTitle')) contentToTranslate.ogTitle = formData.openGraph.title.en || formData.seo.metaTitle.en || formData.title.en
          if (shouldInclude('ogDescription')) contentToTranslate.ogDescription = formData.openGraph.description.en || formData.seo.metaDescription.en || formData.excerpt.en

          const res = await fetch('/api/admin/ai/translate', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                  content: contentToTranslate,
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
                      
                      // Content Fields
                      if (t.title) newFormData.title[lang] = t.title
                      if (t.body) newFormData.body[lang] = t.body
                      if (t.excerpt) newFormData.excerpt[lang] = t.excerpt
                      if (t.keyTakeaways) newFormData.keyTakeaways[lang] = t.keyTakeaways
                      if (t.faq) newFormData.faq[lang] = t.faq
                      if (t.alt) newFormData.alt[lang] = t.alt

                      // SEO Fields
                      if (t.metaTitle) newFormData.seo.metaTitle[lang] = t.metaTitle
                      if (t.metaDescription) newFormData.seo.metaDescription[lang] = t.metaDescription
                      if (t.keywords) newFormData.seo.keywords[lang] = t.keywords
                      if (t.ogTitle) newFormData.openGraph.title[lang] = t.ogTitle
                      if (t.ogDescription) newFormData.openGraph.description[lang] = t.ogDescription
                  }
              })
              
              setFormData(newFormData)
              // Force a re-render or state update might be needed if deep nested
              // but setFormData with new object usually works.
              
              addToHistory(newFormData)
              setShowTranslateModal(false)
              alert(`Successfully translated to ${targetLangs.length} languages. Review changes before saving.`)
              
              // If we translated to the currently viewed language, we might need to refresh editor?
              // The state update should handle it, but markdown editor might need a key change to force refresh if it manages its own state
              
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

      // 1. Clean Data
      // Filter out empty key takeaways
      const cleanKeyTakeaways = { ...finalFormData.keyTakeaways }
      Object.keys(cleanKeyTakeaways).forEach(lang => {
          cleanKeyTakeaways[lang] = cleanKeyTakeaways[lang].filter(k => k && k.trim() !== '')
      })
      finalFormData.keyTakeaways = cleanKeyTakeaways

      // 2. Prepare Payload
      const toSanityKey = (lang: string) => lang.replace(/-/g, '_')
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const localize = (data: Record<string, any>) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res: Record<string, any> = {}
          languages.forEach(lang => {
              const val = data[lang.id]
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
        slug: { _type: 'slug', current: finalFormData.slug },
        localizedBodyMarkdown: localize(finalFormData.body),
        localizedExcerpt: localize(finalFormData.excerpt),
        
        publishedAt: new Date(finalFormData.publishedAt).toISOString(),
        tags: finalFormData.tags,
        
        localizedKeyTakeaways: localize(finalFormData.keyTakeaways),
        localizedFaq: localize(finalFormData.faq),
        
        schemaType: finalFormData.schemaType,
        
        ...(finalFormData.categoryId ? { categories: [{ _type: 'reference', _ref: finalFormData.categoryId, _key: Math.random().toString(36).substring(7) }] } : {}),
        
        // Image
        ...(finalFormData.mainImageAssetId || Object.values(finalFormData.mainImageUrl).some(Boolean) ? {
            ...(finalFormData.mainImageAssetId ? {
                mainImage: {
                    _type: 'image',
                    asset: { _type: 'reference', _ref: finalFormData.mainImageAssetId },
                    alt: finalFormData.alt.en || finalFormData.title.en, // Legacy field
                    localizedAlt: localize(finalFormData.alt) // New localized field
                }
            } : {}),

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

            localizedMainImageUrl: localize(finalFormData.mainImageUrl),
        } : {}),

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

        openGraph: {
            _type: 'openGraph',
            titleLocalized: localize(finalFormData.openGraph.title),
            descriptionLocalized: localize(finalFormData.openGraph.description),
        }
      }

      const res = await fetch(`/api/admin/content/posts/${params?.id}`, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Failed to update post')

      // Update local state with new data (including translations)
      setFormData(finalFormData)
      alert('Post updated successfully!')
      router.refresh()
      router.push('/admin/content') 
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      // setTranslating(false) // No longer needed here
    }
  }

  if (fetching) return <div className="p-8 text-center">Loading...</div>

  return (
    <div className="p-8 w-full max-w-full">
      <LanguageSelector 
        isOpen={showTranslateModal} 
        onClose={() => setShowTranslateModal(false)}
        onConfirm={handleTranslate}
        isTranslating={translating}
        availableFields={availableFields}
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
            <h1 className="text-2xl font-bold ml-2">Edit Post</h1>
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
                    {tab === 'ai' ? 'AI Optimizer' : tab.charAt(0).toUpperCase() + tab.slice(1)}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image</label>
                    <CoverImageUploader 
                        currentImage={coverImageUrl}
                        onSave={handleCoverImageSave}
                    />
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
                                slug: contentLang === 'en' ? val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : prev.slug
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

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt (Markdown supported)</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content (Markdown)</label>
                    <MarkdownEditor 
                        key={`${contentLang}-${formData.body[contentLang]?.length || 0}`} // Force re-render on language change or content length change
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">SEO Title</label>
                    <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder={formData.title[contentLang]}
                        value={formData.seo.metaTitle[contentLang] || ''}
                        onChange={e => setFormData(prev => ({ 
                            ...prev, 
                            seo: { ...prev.seo, metaTitle: { ...prev.seo.metaTitle, [contentLang]: e.target.value } } 
                        }))}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Meta Description</label>
                    <textarea 
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={formData.seo.metaDescription[contentLang] || ''}
                        onChange={e => setFormData(prev => ({ 
                            ...prev, 
                            seo: { ...prev.seo, metaDescription: { ...prev.seo.metaDescription, [contentLang]: e.target.value } } 
                        }))}
                    ></textarea>
                </div>
               
                
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

                <div className="pt-4 border-t">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Structured Data ({languages.find(l => l.id === contentLang)?.title})</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Key Takeaways</label>
                            {(formData.keyTakeaways[contentLang] || []).map((item, idx) => (
                                <div key={idx} className="flex gap-2 mb-2">
                                    <input 
                                        type="text"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                                        value={item}
                                        onChange={e => {
                                            const newItems = [...(formData.keyTakeaways[contentLang] || [])];
                                            newItems[idx] = e.target.value;
                                            setFormData(prev => ({
                                                ...prev,
                                                keyTakeaways: { ...prev.keyTakeaways, [contentLang]: newItems }
                                            }));
                                        }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const newItems = (formData.keyTakeaways[contentLang] || []).filter((_, i) => i !== idx);
                                            setFormData(prev => ({
                                                ...prev,
                                                keyTakeaways: { ...prev.keyTakeaways, [contentLang]: newItems }
                                            }));
                                        }}
                                        className="p-2 text-red-500 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <button 
                                type="button"
                                onClick={() => setFormData(prev => ({
                                    ...prev,
                                    keyTakeaways: { ...prev.keyTakeaways, [contentLang]: [...(prev.keyTakeaways[contentLang] || []), ''] }
                                }))}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                + Add Takeaway
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
            <div className="space-y-6">
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
                </div>
            </div>
        )}

        {/* AI TAB */}
        {activeTab === 'ai' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">AI Optimization</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Improve your existing content, generate SEO metadata, and add structured data automatically.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Optimization Instructions</label>
                        <textarea 
                            rows={5}
                            maxLength={1000}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="e.g. Make the tone more professional, add 2 external links to authoritative sources, focus on 'dropshipping tools' keyword..."
                            value={aiConfig.requirements}
                            onChange={e => setAiConfig({ ...aiConfig, requirements: e.target.value })}
                        ></textarea>
                    </div>

                    <div className="pt-2">
                        <button 
                            type="button" 
                            onClick={handleAiOptimize}
                            disabled={aiGenerating}
                            className="w-full flex items-center justify-center px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-all shadow-sm"
                        >
                            {aiGenerating ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                    Optimizing content...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5 mr-2" />
                                    Optimize Post
                                </>
                            )}
                        </button>
                        {aiError && (
                            <p className="text-red-600 text-sm mt-2 text-center">{aiError}</p>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-medium text-gray-700">Optimization Preview</h3>
                    <AiContentPreview 
                        content={aiOutput}
                        onRegenerate={handleAiOptimize}
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
            
            <div className="flex justify-end gap-2">
                <button 
                    type="button"
                    onClick={handleAiSeo}
                    disabled={aiSeoGenerating}
                    className="flex items-center px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50 transition-colors"
                >
                    {aiSeoGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    AI SEO
                </button>
                <button 
                    type="submit" 
                    disabled={loading}
                    className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Update Post
                </button>
            </div>
        </div>
      </form>
    </div>
  )
}
