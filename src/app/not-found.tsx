import Link from 'next/link'
 
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md mx-auto">
        <div className="mb-6 flex justify-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-4xl">🔍</span>
            </div>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-3">Page Not Found</h2>
        <p className="text-gray-600 mb-8">
            The page you are looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
                href="/" 
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
                Return Home
            </Link>
            <Link 
                href="/blog" 
                className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
                Read Blog
            </Link>
        </div>
      </div>
    </div>
  )
}
