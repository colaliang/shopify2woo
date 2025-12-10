import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { Image as ImageIcon, X, Upload, Check } from 'lucide-react'
import { getCroppedImg } from '@/lib/cropImage'

interface Point {
  x: number
  y: number
}

interface Area {
  width: number
  height: number
  x: number
  y: number
}

interface CoverImageUploaderProps {
  currentImage?: string
  onSave: (file: File) => Promise<void>
}

export default function CoverImageUploader({ currentImage, onSave }: CoverImageUploaderProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB')
        return
      }
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        setImageSrc(reader.result?.toString() || null)
        setError(null)
      })
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    
    try {
      setLoading(true)
      const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
      if (croppedImageBlob) {
          const file = new File([croppedImageBlob], 'cover-image.jpg', { type: 'image/jpeg' })
          await onSave(file)
          setImageSrc(null) // Close cropper
      }
    } catch (e) {
      console.error(e)
      setError('Failed to crop image')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Current Image or Placeholder */}
      <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 hover:border-blue-500 transition-colors group">
        {currentImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img 
            src={currentImage} 
            alt="Cover" 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <ImageIcon className="w-12 h-12 mb-2" />
            <span className="text-sm">No cover image</span>
          </div>
        )}
        
        {/* Overlay Upload Button */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <label className="cursor-pointer bg-white text-gray-900 px-4 py-2 rounded-full font-medium flex items-center hover:bg-gray-100">
                <Upload className="w-4 h-4 mr-2" />
                Change Cover
                <input 
                    type="file" 
                    className="hidden" 
                    accept="image/png, image/jpeg"
                    onChange={handleFileChange}
                />
            </label>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Cropper Modal */}
      {imageSrc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Crop Image</h3>
                <button onClick={() => setImageSrc(null)} className="text-gray-500 hover:text-gray-900">
                    <X className="w-5 h-5" />
                </button>
            </div>
            
            <div className="relative flex-1 min-h-[400px] bg-gray-900">
                <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={16 / 9}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                />
            </div>

            <div className="p-4 border-t bg-gray-50 flex items-center justify-between gap-4">
                <div className="flex-1">
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Zoom</label>
                    <input
                        type="range"
                        value={zoom}
                        min={1}
                        max={3}
                        step={0.1}
                        aria-labelledby="Zoom"
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="w-full"
                    />
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setImageSrc(null)}
                        className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={loading}
                        className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex items-center disabled:opacity-50"
                    >
                        {loading ? 'Saving...' : (
                            <>
                                <Check className="w-4 h-4 mr-2" />
                                Save
                            </>
                        )}
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
