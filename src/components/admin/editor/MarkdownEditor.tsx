'use client'

import React from 'react'
import MarkdownIt from 'markdown-it'
import MdEditor from 'react-markdown-editor-lite'
import 'react-markdown-editor-lite/lib/index.css'

interface MarkdownEditorProps {
  content: string
  onChange: (markdown: string) => void
  onImageUpload?: (file: File) => Promise<string>
  style?: React.CSSProperties
}

const mdParser = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})

export default function MarkdownEditor({ content, onChange, onImageUpload, style }: MarkdownEditorProps) {
  async function handleImageUpload(file: File) {
    if (onImageUpload) {
      const url = await onImageUpload(file)
      return url
    }
    return ''
  }

  return (
    <div className="bg-white rounded-md overflow-hidden border border-gray-300">
        <MdEditor
            style={{ height: '500px', ...style }}
            renderHTML={(text) => mdParser.render(text)}
            value={content}
            onChange={({ text }) => onChange(text)}
            onImageUpload={handleImageUpload}
            view={{ menu: true, md: true, html: false }}
            canView={{
                menu: true,
                md: true,
                html: true,
                both: true,
                fullScreen: true,
                hideMenu: true,
            }}
        />
    </div>
  )
}
