'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing PayPal authorization...');

  useEffect(() => {
    async function processCode() {
      if (!code) {
        setStatus('error');
        setMessage('No authorization code found.');
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setStatus('error');
            setMessage('Unauthorized. Please log in.');
            return;
        }

        const res = await fetch('/api/admin/payment/paypal/exchange', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ code })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setStatus('success');
          setMessage('PayPal connected successfully! Redirecting...');
          setTimeout(() => {
            router.push('/admin/settings');
          }, 2000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to connect PayPal.');
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
        setMessage('An unexpected error occurred.');
      }
    }

    processCode();
  }, [code, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="p-8 bg-white rounded shadow-md max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-4">PayPal Authorization</h1>
        
        {status === 'processing' && (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center text-green-600">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p>{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center text-red-600">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <p className="mb-4">{message}</p>
            <button 
              onClick={() => router.push('/admin/settings')}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Back to Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CallbackPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <CallbackContent />
        </Suspense>
    );
}
