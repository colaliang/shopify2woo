'use client'

import { useState, useEffect } from 'react'
import { X, Globe } from 'lucide-react'
import { languages } from '@/sanity/lib/languages'

interface LanguageSelectorProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (selectedLangs: string[]) => void
    isTranslating: boolean
}

export default function LanguageSelector({ isOpen, onClose, onConfirm, isTranslating }: LanguageSelectorProps) {
    const [selected, setSelected] = useState<string[]>([])
    
    // Load preference on mount
    useEffect(() => {
        // Wrap in a small timeout or just run once?
        // Actually, we can initialize state lazily if we are on client, but localStorage is not available during SSR.
        // So we must do it in useEffect.
        // The error is because we are calling it synchronously.
        // We can just suppress the warning if we know it's fine (it's a mount effect), 
        // OR we can use a ref to track if it's mounted.
        // Or simply:
        const saved = localStorage.getItem('admin_translation_preference')
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                setSelected(parsed)
            } catch (e) { console.error(e) }
        } else {
            setSelected(languages.filter(l => l.id !== 'en').map(l => l.id))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) 


    if (!isOpen) return null

    const toggleLang = (id: string) => {
        const newSelected = selected.includes(id)
            ? selected.filter(l => l !== id)
            : [...selected, id]
        setSelected(newSelected)
        localStorage.setItem('admin_translation_preference', JSON.stringify(newSelected))
    }

    const selectAll = () => {
        const all = languages.filter(l => l.id !== 'en').map(l => l.id)
        setSelected(all)
        localStorage.setItem('admin_translation_preference', JSON.stringify(all))
    }

    const deselectAll = () => {
        setSelected([])
        localStorage.setItem('admin_translation_preference', JSON.stringify([]))
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b flex items-center justify-between bg-gray-50">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-blue-600" />
                        Select Languages to Translate
                    </h3>
                    {!isTranslating && (
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
                
                <div className="p-4 overflow-y-auto flex-1">
                    <div className="flex justify-end gap-3 mb-4 text-sm">
                        <button onClick={selectAll} className="text-blue-600 hover:underline">Select All</button>
                        <button onClick={deselectAll} className="text-gray-500 hover:underline">Deselect All</button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {languages.filter(l => l.id !== 'en').map(lang => (
                            <label 
                                key={lang.id} 
                                className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                                    selected.includes(lang.id)
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <input 
                                    type="checkbox" 
                                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    checked={selected.includes(lang.id)}
                                    onChange={() => toggleLang(lang.id)}
                                />
                                <span className="ml-3 text-sm font-medium text-gray-700">{lang.title}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        disabled={isTranslating}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => onConfirm(selected)}
                        disabled={isTranslating || selected.length === 0}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                        {isTranslating ? 'Translating...' : `Translate to ${selected.length} Languages`}
                    </button>
                </div>
            </div>
        </div>
    )
}
