'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useUserStore } from '@/stores/userStore';

export default function WeChatPayPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderId = searchParams.get('orderId');
    const { refreshCredits } = useUserStore();

    const [loading, setLoading] = useState(true);
    const [qrUrl, setQrUrl] = useState('');
    const [error, setError] = useState('');
    const [status, setStatus] = useState<'pending' | 'paid' | 'expired'>('pending');

    useEffect(() => {
        if (!orderId) {
            setError('Missing Order ID');
            setLoading(false);
            return;
        }

        // 1. Fetch QR Code URL
        async function fetchQr() {
            try {
                // Use the standard client helper we already have
                const { getSupabaseBrowser } = await import('@/lib/supabaseClient');
                const supabase = getSupabaseBrowser();
                const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
                
                if (!session) {
                    setError('Please login first');
                    setLoading(false);
                    return;
                }

                const res = await fetch('/api/payment/wechat/pay', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ orderId })
                });

                const data = await res.json();
                if (res.ok && data.code_url) {
                    setQrUrl(data.code_url);
                } else {
                    setError(data.error || 'Failed to generate QR Code');
                }
            } catch (e) {
                setError('Network Error');
            } finally {
                setLoading(false);
            }
        }

        fetchQr();
    }, [orderId]);

    // 2. Poll Status
    useEffect(() => {
        if (!orderId || status === 'paid') return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/payment/check-status?orderId=${orderId}`);
                const data = await res.json();
                if (data.status === 'paid') {
                    setStatus('paid');
                    refreshCredits();
                    clearInterval(interval);
                    // Close window or redirect after delay
                    setTimeout(() => {
                        if (window.opener) {
                            window.opener.postMessage('payment_success', '*');
                            window.close();
                        } else {
                            router.push('/admin/dashboard'); // Fallback
                        }
                    }, 3000);
                }
            } catch (e) {
                // Ignore polling errors
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [orderId, status, router, refreshCredits]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-green-600 mx-auto mb-4" />
                    <p>Loading Payment...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow max-w-md text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Payment Error</h1>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button onClick={() => window.close()} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
                        Close
                    </button>
                </div>
            </div>
        );
    }

    if (status === 'paid') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow max-w-md text-center">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
                    <p className="text-gray-600 mb-6">Your credits have been added.</p>
                    <p className="text-sm text-gray-400">Closing window...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#f2f2f2] p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full text-center space-y-6">
                <div className="flex items-center justify-center gap-2 text-[#07C160]">
                    {/* WeChat Logo Placeholder */}
                    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.5,13.5A1.5,1.5 0 1,0 7,15A1.5,1.5 0 0,0 8.5,13.5M14.5,13.5A1.5,1.5 0 1,0 13,15A1.5,1.5 0 0,0 14.5,13.5M19.4,12.3C19.4,8.5 15.6,5.3 10.7,5.3C5.8,5.3 2,8.5 2,12.3C2,14.7 3.3,16.8 5.4,18L4.8,20.8L7.5,19.2C8.5,19.4 9.6,19.5 10.7,19.5C10.9,19.5 11.2,19.5 11.4,19.5C11.3,19.1 11.3,18.7 11.3,18.3C11.3,15.6 13.9,13.4 17.1,13.4C17.9,13.4 18.7,13.5 19.4,13.8V12.3M17.1,14.3C14.5,14.3 12.3,16.1 12.3,18.3C12.3,20.5 14.5,22.3 17.1,22.3C18,22.3 18.8,22.1 19.6,21.7L21.7,22.7L21.3,20.6C22.4,19.9 23,19.2 23,18.3C23,16.1 20.9,14.3 17.1,14.3M15.5,17.2A0.9,0.9 0 1,1 14.6,18.1A0.9,0.9 0 0,1 15.5,17.2M18.7,17.2A0.9,0.9 0 1,1 17.8,18.1A0.9,0.9 0 0,1 18.7,17.2Z" />
                    </svg>
                    <h1 className="text-xl font-bold text-gray-900">WeChat Pay</h1>
                </div>
                
                <div className="border-t border-b border-gray-100 py-6">
                    <p className="text-sm text-gray-500 mb-4">Please scan the QR code using WeChat</p>
                    <div className="flex justify-center">
                        <QRCodeSVG value={qrUrl} size={200} level="H" includeMargin={true} />
                    </div>
                </div>

                <div className="text-sm text-gray-500">
                    <p>Order ID: {orderId}</p>
                </div>
            </div>
            
            <button 
                onClick={() => window.close()} 
                className="mt-8 text-gray-500 hover:text-gray-700 underline"
            >
                Cancel Payment
            </button>
        </div>
    );
}
