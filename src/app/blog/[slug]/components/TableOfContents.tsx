'use client'

import { useState, useEffect } from 'react'
import MarkdownIt from 'markdown-it'
import { useTranslation } from 'react-i18next'

const md = new MarkdownIt()

interface TocItem {
  id: string
  text: string
  level: number
}

interface TableOfContentsProps {
  content?: string
  markdown?: string
}

export default function TableOfContents({ content, markdown }: TableOfContentsProps) {
  const { t } = useTranslation()
  const [headings, setHeadings] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    // Wait for content to be rendered in the DOM
    const timer = setTimeout(() => {
      let htmlContent = content || ''
      if (markdown) {
        htmlContent = md.render(markdown)
      }

      if (!htmlContent) return

      // We need to query the actual DOM to find the headings that were rendered by ContentRenderer
      // The previous approach parsed a string which didn't match the actual DOM elements if IDs were generated dynamically
      const articleContent = document.querySelector('.prose')
      if (!articleContent) return

      const elements = Array.from(articleContent.querySelectorAll('h2, h3'))
      
      const items = elements.map((el, index) => {
        // Ensure element has an ID
        if (!el.id) {
          el.id = `heading-${index}`
        }
        
        return {
          id: el.id,
          text: el.textContent || '',
          level: parseInt(el.tagName[1])
        }
      })
      
      setHeadings(items)
    }, 100) // Small delay to ensure DOM is ready

    return () => clearTimeout(timer)
  }, [content, markdown])

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
        <h3 className="text-lg font-bold text-gray-900">{t('blog.table_of_contents')}</h3>
        <span className="text-xs text-gray-500 font-medium">
            {isCollapsed ? t('blog.show') : t('blog.hide')}
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
                const element = document.getElementById(heading.id)
                if (element) {
                    const headerOffset = 80 // Adjust based on your header height + extra spacing
                    const elementPosition = element.getBoundingClientRect().top
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset
                  
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: "smooth"
                    })
                    setActiveId(heading.id)
                }
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
