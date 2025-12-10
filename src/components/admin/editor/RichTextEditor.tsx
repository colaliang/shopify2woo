'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Bold, Italic, List, ListOrdered, Image as ImageIcon, Link as LinkIcon, Quote, Heading1, Heading2, Code, Table as TableIcon } from 'lucide-react'
import { useCallback } from 'react'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  onImageUpload?: (file: File) => Promise<string>
}

export function RichTextEditor({ content, onChange, onImageUpload }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
      }),
      Image,
      Placeholder.configure({
        placeholder: 'Write something amazing...',
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
        attributes: {
            class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl m-5 focus:outline-none min-h-[300px]'
        }
    }
  })

  const addImage = useCallback(() => {
    if (!onImageUpload) {
        const url = window.prompt('URL')
        if (url) {
            editor?.chain().focus().setImage({ src: url }).run()
        }
        return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
        if (input.files?.length) {
            const file = input.files[0]
            try {
                const url = await onImageUpload(file)
                editor?.chain().focus().setImage({ src: url }).run()
            } catch (error) {
                console.error('Failed to upload image:', error)
                alert('Failed to upload image')
            }
        }
    }
    input.click()
  }, [editor, onImageUpload])

  const setLink = useCallback(() => {
    const previousUrl = editor?.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)

    if (url === null) {
      return
    }

    if (url === '') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  if (!editor) {
    return null
  }

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="border-b border-gray-200 bg-gray-50 p-2 flex flex-wrap gap-1">
        <ToolbarButton 
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            icon={<Bold className="w-4 h-4" />}
            title="Bold"
        />
        <ToolbarButton 
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            icon={<Italic className="w-4 h-4" />}
            title="Italic"
        />
        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />
        
        <ToolbarButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            icon={<Heading1 className="w-4 h-4" />}
            title="Heading 1"
        />
        <ToolbarButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            icon={<Heading2 className="w-4 h-4" />}
            title="Heading 2"
        />
        
        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <ToolbarButton 
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            icon={<List className="w-4 h-4" />}
            title="Bullet List"
        />
        <ToolbarButton 
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            icon={<ListOrdered className="w-4 h-4" />}
            title="Ordered List"
        />
        <ToolbarButton 
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            icon={<Quote className="w-4 h-4" />}
            title="Quote"
        />
        <ToolbarButton 
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive('codeBlock')}
            icon={<Code className="w-4 h-4" />}
            title="Code Block"
        />

        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <ToolbarButton 
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            isActive={editor.isActive('table')}
            icon={<TableIcon className="w-4 h-4" />}
            title="Insert Table"
        />

        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <ToolbarButton 
            onClick={setLink}
            isActive={editor.isActive('link')}
            icon={<LinkIcon className="w-4 h-4" />}
            title="Link"
        />
        <ToolbarButton 
            onClick={addImage}
            isActive={false}
            icon={<ImageIcon className="w-4 h-4" />}
            title="Image"
        />
      </div>

      {/* Content */}
      <EditorContent editor={editor} className="min-h-[300px] p-4" />
    </div>
  )
}

function ToolbarButton({ onClick, isActive, icon, title }: { onClick: () => void, isActive: boolean, icon: React.ReactNode, title: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                isActive ? 'bg-gray-200 text-blue-600' : 'text-gray-600'
            }`}
        >
            {icon}
        </button>
    )
}
