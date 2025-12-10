'use client'

import { useState, useEffect } from 'react'

interface TocItem {
  id: string
  text: string
  level: number
}

interface TableOfContentsProps {
  content: string
}

export default function TableOfContents({ content }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    // Parse HTML content to extract headings
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/html')
    const elements = Array.from(doc.querySelectorAll('h2, h3'))
    
    const items = elements.map((el, index) => {
      const id = el.id || `heading-${index}`
      return {
        id,
        text: el.textContent || '',
        level: parseInt(el.tagName[1])
      }
    })
    
    // Defer state update to avoid synchronous update in effect (though usually safe here, but to satisfy linter)
    // Actually, setting state in useEffect IS the correct way to update state based on props/external data.
    // The linter warning might be false positive or due to strict config. 
    // However, let's keep it simple.
    setHeadings(items)
  }, [content])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '-100px 0px -66% 0px' }
    )

    headings.forEach((heading) => {
      const element = document.getElementById(heading.id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [headings])

  if (headings.length === 0) return null

  return (
    <div className="bg-gray-50 rounded-xl p-6 border border-gray-100 sticky top-24">
      <div 
        className="flex items-center justify-between cursor-pointer mb-4"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <h3 className="text-lg font-bold text-gray-900">Table of Contents</h3>
        <span className="text-xs text-gray-500 font-medium">
            {isCollapsed ? 'show' : 'hide'}
        </span>
      </div>
      
      {!isCollapsed && (
        <nav className="space-y-1">
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              className={`block text-sm py-1.5 transition-colors border-l-2 pl-4 ${
                activeId === heading.id
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              } ${heading.level === 3 ? 'ml-4' : ''}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth' })
                setActiveId(heading.id)
              }}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}
