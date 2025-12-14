'use client'

import { useState, useEffect } from 'react'
import { X, Globe, CheckSquare } from 'lucide-react'
import { languages } from '@/sanity/lib/languages'

export interface FieldOption {
    id: string
    label: string
}

interface LanguageSelectorProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (selectedLangs: string[], selectedFields?: string[]) => void
    isTranslating: boolean
    availableFields?: FieldOption[]
    sourceLang?: string
}

export default function LanguageSelector({ isOpen, onClose, onConfirm, isTranslating, availableFields, sourceLang = 'en' }: LanguageSelectorProps) {
    const [selected, setSelected] = useState<string[]>([])
    const [selectedFields, setSelectedFields] = useState<string[]>([])
    
    // Load preference on mount
    useEffect(() => {
        const saved = localStorage.getItem('admin_translation_preference')
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                // eslint-disable-next-line
                setSelected(parsed)
            } catch (e) { console.error(e) }
        } else {
            setSelected(languages.filter(l => l.id !== sourceLang).map(l => l.id))
        }
    }, [sourceLang]) 

    // Initialize selected fields when availableFields changes
    useEffect(() => {
        if (availableFields) {
            // Default to select all fields
            // eslint-disable-next-line
            setSelectedFields(availableFields.map(f => f.id))
        } else {
            setSelectedFields([])
        }
    }, [availableFields])


    if (!isOpen) return null

    const toggleLang = (id: string) => {
        const newSelected = selected.includes(id)
            ? selected.filter(l => l !== id)
            : [...selected, id]
        setSelected(newSelected)
        localStorage.setItem('admin_translation_preference', JSON.stringify(newSelected))
    }

    const selectAll = () => {
        const all = languages.filter(l => l.id !== sourceLang).map(l => l.id)
        setSelected(all)
        localStorage.setItem('admin_translation_preference', JSON.stringify(all))
    }

    const deselectAll = () => {
        setSelected([])
        localStorage.setItem('admin_translation_preference', JSON.stringify([]))
    }

    const toggleField = (id: string) => {
        setSelectedFields(prev => 
            prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
        )
    }

    const selectAllFields = () => {
        if (availableFields) {
            setSelectedFields(availableFields.map(f => f.id))
        }
    }

    const deselectAllFields = () => {
        setSelectedFields([])
    }

    const handleConfirm = () => {
        if (availableFields && selectedFields.length === 0) {
            alert('Please select at least one field to translate.')
            return
        }
        if (selected.length === 0) {
            alert('Please select at least one language.')
            return
        }
        // When there are no availableFields (e.g. general translation), selectedFields might be empty
        // We should pass undefined in that case if availableFields prop was not provided
        onConfirm(selected, availableFields ? selectedFields : undefined)
    }

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget && !isTranslating) {
            onClose()
        }
    }

    return (
        <div 
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={handleBackdropClick}
        >
            <div 
                className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b flex items-center justify-between bg-gray-50">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-blue-600" />
                        Translation Options
                    </h3>
                    {!isTranslating && (
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Fields Selection Section */}
                    {availableFields && availableFields.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                                    1. Select Content to Translate
                                </h4>
                                <div className="text-xs space-x-3">
                                    <button onClick={selectAllFields} className="text-blue-600 hover:text-blue-800">Select All</button>
                                    <button onClick={deselectAllFields} className="text-gray-500 hover:text-gray-700">None</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {availableFields.map(field => (
                                    <label 
                                        key={field.id}
                                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all select-none ${
                                            selectedFields.includes(field.id)
                                            ? 'border-purple-500 bg-purple-50 text-purple-900'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                        }`}
                                        onClick={(e) => {
                                            e.preventDefault()
                                            toggleField(field.id)
                                        }}
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${
                                            selectedFields.includes(field.id) ? 'bg-purple-600 border-purple-600' : 'border-gray-400'
                                        }`}>
                                            {selectedFields.includes(field.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className="text-sm font-medium">{field.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Languages Selection Section */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                                {availableFields ? '2. Select Target Languages' : 'Select Target Languages'}
                            </h4>
                            <div className="text-xs space-x-3">
                                <button onClick={selectAll} className="text-blue-600 hover:text-blue-800">Select All</button>
                                <button onClick={deselectAll} className="text-gray-500 hover:text-gray-700">None</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {languages.filter(l => l.id !== sourceLang).map(lang => (
                                <label 
                                    key={lang.id} 
                                    className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all select-none ${
                                        selected.includes(lang.id)
                                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                    }`}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        toggleLang(lang.id)
                                    }}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${
                                        selected.includes(lang.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-400'
                                    }`}>
                                        {selected.includes(lang.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className="text-sm font-medium">{lang.title}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        disabled={isTranslating}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleConfirm}
                        disabled={isTranslating || selected.length === 0 || (!!availableFields && selectedFields.length === 0)}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                    >
                        {isTranslating ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                Translating...
                            </>
                        ) : (
                            <>
                                <Globe className="w-4 h-4" />
                                Start Translation
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
