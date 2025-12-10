'use client'

import React, { useState, useRef } from 'react'
import MarkdownIt from 'markdown-it'
import { 
  Code, 
  Eye, 
  Columns, 
  ZoomIn, 
  ZoomOut, 
  Copy, 
  FileText, 
  Check,
  RefreshCw
} from 'lucide-react'

const mdParser = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})

interface AiContentPreviewProps {
  content: string
  onRegenerate?: () => void
  onUseContent?: () => void
  isGenerating?: boolean
}

export default function AiContentPreview({ 
  content, 
  onRegenerate, 
  onUseContent,
  isGenerating = false
}: AiContentPreviewProps) {
  const [viewMode, setViewMode] = useState<'code' | 'preview' | 'split'>('split')
  const [zoom, setZoom] = useState(100)
  const [copied, setCopied] = useState(false)
  
  const codeRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)

  // Sync scrolling
  const handleScroll = (source: 'code' | 'preview') => {
    if (viewMode !== 'split') return
    if (isScrolling.current) return

    isScrolling.current = true
    
    const sourceEl = source === 'code' ? codeRef.current : previewRef.current
    const targetEl = source === 'code' ? previewRef.current : codeRef.current

    if (sourceEl && targetEl) {
      const percentage = sourceEl.scrollTop / (sourceEl.scrollHeight - sourceEl.clientHeight)
      targetEl.scrollTop = percentage * (targetEl.scrollHeight - targetEl.clientHeight)
    }

    setTimeout(() => {
      isScrolling.current = false
    }, 50)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const adjustZoom = (delta: number) => {
    setZoom(prev => Math.min(Math.max(prev + delta, 50), 200))
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white flex flex-col h-[600px] overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-gray-50">
        <div className="flex items-center gap-1">
          <div className="flex bg-gray-200 rounded-lg p-1 mr-4">
            <button
              onClick={() => setViewMode('code')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'code' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              title="Code View"
            >
              <Code className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'preview' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              title="Preview View"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'split' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              title="Split View"
            >
              <Columns className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 border-l pl-4 border-gray-300">
            <button
              onClick={() => adjustZoom(-10)}
              className="p-1.5 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium w-12 text-center text-gray-600">{zoom}%</span>
            <button
              onClick={() => adjustZoom(10)}
              className="p-1.5 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {content && (
            <>
               <button
                onClick={onRegenerate}
                disabled={isGenerating}
                className="p-1.5 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200 mr-2"
                title="Regenerate"
              >
                <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={handleCopy}
                className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 mr-1.5 text-green-600" /> : <Copy className="w-3 h-3 mr-1.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              
              {onUseContent && (
                <button
                  onClick={onUseContent}
                  className="flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                >
                  <FileText className="w-3 h-3 mr-1.5" />
                  Use This Content
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative bg-gray-50">
        {!content ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Columns className="w-8 h-8 text-gray-300" />
                </div>
                <p>AI generated content will appear here.</p>
            </div>
        ) : (
            <div className={`flex h-full ${viewMode === 'split' ? '' : 'justify-center'}`}>
                {/* Code View */}
                <div 
                    className={`
                        ${viewMode === 'preview' ? 'hidden' : ''} 
                        ${viewMode === 'split' ? 'w-1/2 border-r border-gray-200' : 'w-full'} 
                        bg-white h-full overflow-hidden flex flex-col
                    `}
                >
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between">
                        <span>Markdown Source</span>
                    </div>
                    <textarea
                        ref={codeRef}
                        value={content}
                        readOnly
                        onScroll={() => handleScroll('code')}
                        className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none text-gray-800 leading-relaxed"
                        style={{ fontSize: `${Math.max(12, zoom * 0.14)}px` }}
                    />
                </div>

                {/* Preview View */}
                <div 
                    className={`
                        ${viewMode === 'code' ? 'hidden' : ''} 
                        ${viewMode === 'split' ? 'w-1/2' : 'w-full'} 
                        bg-white h-full overflow-hidden flex flex-col
                    `}
                >
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">Preview</div>
                    <div 
                        ref={previewRef}
                        onScroll={() => handleScroll('preview')}
                        className="w-full h-full overflow-y-auto p-6"
                    >
                         <div 
                            className="prose prose-sm sm:prose lg:prose-lg max-w-none prose-img:rounded-lg prose-headings:font-bold prose-a:text-blue-600"
                            style={{ zoom: `${zoom}%` }}
                            dangerouslySetInnerHTML={{ __html: mdParser.render(content) }} 
                         />
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  )
}
