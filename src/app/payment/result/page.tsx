'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n'; // Ensure i18n is initialized

function PaymentResultContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const status = searchParams.get('status');
  const [countdown, setCountdown] = useState(5);

  const isSuccess = !!sessionId && status !== 'cancel';

  useEffect(() => {
    if (isSuccess) {
      // Notify opener
      if (window.opener) {
        window.opener.postMessage('payment_success', '*');
      }
    }
    
    // Auto close
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (window.opener) {
            window.close();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSuccess]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
        {isSuccess ? (
          <>
            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-6">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('payment.success_title')}</h1>
            <p className="text-gray-600 mb-6">
              {t('payment.success_desc')}
            </p>
          </>
        ) : (
          <>
             <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-6">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('payment.cancel_title')}</h1>
            <p className="text-gray-600 mb-6">
              {t('payment.cancel_desc')}
            </p>
          </>
        )}

        <p className="text-sm text-gray-500">
          Closing window in {countdown} seconds...
        </p>
        <button 
            onClick={() => window.close()}
            className="mt-4 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
            {t('payment.close_window')}
        </button>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
            <PaymentResultContent />
        </Suspense>
    );
}
