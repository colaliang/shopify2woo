'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    async function logAccessAttempt(userId: string, success: boolean, details?: string) {
      try {
        await fetch('/api/admin/sanity-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, success, details })
        })
      } catch (e) {
        console.error('Failed to log access attempt', e)
      }
    }

    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session?.access_token) {
          await logAccessAttempt('anonymous', false, 'No session')
          setAuthorized(false)
          return
        }

        // Verify admin status
        const res = await fetch('/api/admin/check', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (res.ok) {
          await logAccessAttempt(session.user.id, true)
          setAuthorized(true)
        } else {
          await logAccessAttempt(session.user.id, false, 'Not an admin')
          setAuthorized(false)
        }
      } catch (error) {
        console.error('Auth check failed', error)
        await logAccessAttempt('unknown', false, 'Auth check error')
        setAuthorized(false)
      }
    }

    checkAuth()
  }, [])

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying access permissions...</p>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            You do not have permission to access the Content Management Studio. 
            This area is restricted to administrators only.
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Back to Admin
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
            >
              Go Home
            </button>
          </div>
          <p className="mt-6 text-xs text-gray-400">
            Error 403: Forbidden
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
