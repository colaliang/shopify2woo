'use client'

import { useEffect, useRef } from 'react'

interface ContentRendererProps {
  html: string
}

export default function ContentRenderer({ html }: ContentRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Add IDs to headings for TOC
    const headings = containerRef.current.querySelectorAll('h2, h3')
    headings.forEach((heading, index) => {
      if (!heading.id) {
        heading.id = `heading-${index}`
      }
    })

    // Lazy load images handled by browser natively mostly, but we can enhance
    const images = containerRef.current.querySelectorAll('img')
    images.forEach((img) => {
      img.loading = 'lazy'
      img.classList.add('rounded-lg', 'shadow-sm', 'my-8', 'w-full', 'object-cover')
      
      // Wrap in figure for caption if needed, or just leave as is
      // Add zoom capability (simplified version: just open in new tab or modal)
      img.style.cursor = 'zoom-in'
      img.onclick = () => {
        window.open(img.src, '_blank')
      }
    })
  }, [html])

  return (
    <div 
      ref={containerRef}
      className="prose prose-lg prose-blue max-w-none 
        prose-headings:font-bold prose-headings:text-gray-900 
        prose-p:text-gray-700 prose-p:leading-relaxed prose-p:text-lg
        prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
        prose-img:rounded-xl prose-img:shadow-md
        prose-li:text-gray-700
      "
      dangerouslySetInnerHTML={{ __html: html }} 
    />
  )
}
