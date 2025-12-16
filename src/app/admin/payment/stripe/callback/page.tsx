'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Connecting to Stripe...');

  useEffect(() => {
    async function exchange() {
      if (error) {
        setStatus('error');
        setMessage(`Authorization failed: ${errorDescription || error}`);
        return;
      }

      if (!code) {
        setStatus('error');
        setMessage('No authorization code received.');
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const res = await fetch('/api/admin/payment/stripe/exchange', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ code })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setStatus('success');
          setMessage('Stripe connected successfully! Redirecting...');
          setTimeout(() => {
            router.push('/admin/settings');
          }, 2000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to exchange token');
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
        setMessage('An unexpected error occurred.');
      }
    }

    exchange();
  }, [code, error, errorDescription, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        <h1 className="text-xl font-bold mb-4">Stripe Connection</h1>
        
        {status === 'loading' && (
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-green-600">
            <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p>{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-red-600">
            <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

export default function StripeCallbackPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <CallbackContent />
    </Suspense>
  );
}
