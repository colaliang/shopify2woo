'use client'

import { useState, useEffect } from 'react'
import supabase from '@/lib/supabase'
import { CheckCircle, AlertCircle } from 'lucide-react'

export default function AdminSettingsPage() {
    const [paypalStatus, setPaypalStatus] = useState<{
        connected: boolean;
        merchantName?: string;
        merchantEmail?: string;
    } | null>(null);

    useEffect(() => {
        async function fetchStatus() {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;
                
                const res = await fetch('/api/admin/payment/config', {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setPaypalStatus(data);
                }
            } catch (e) {
                console.error('Failed to fetch payment config', e);
            }
        }
        fetchStatus();
    }, []);

    return (
        <div className="p-8 w-full max-w-full">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-bold">Admin Settings</h1>
            </div>

            <div className="space-y-6">
                {/* Payment Integrations */}
                <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold mb-4 border-b pb-2">Payment Integrations</h2>
                    <div className="grid gap-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-medium text-gray-900">PayPal</h3>
                                    {paypalStatus?.connected && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Connected
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-500 mb-1">Connect your PayPal account to accept payments directly.</p>
                                {paypalStatus?.connected && (
                                    <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded mt-2 border border-gray-100">
                                        <p><strong>Merchant:</strong> {paypalStatus.merchantName || 'N/A'}</p>
                                        <p><strong>Email:</strong> {paypalStatus.merchantEmail || 'N/A'}</p>
                                    </div>
                                )}
                            </div>
                            
                            {!paypalStatus?.connected ? (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            const { data: { session } } = await supabase.auth.getSession();
                                            const res = await fetch('/api/admin/payment/paypal/auth-url', {
                                                headers: { 'Authorization': `Bearer ${session?.access_token}` }
                                            });
                                            const data = await res.json();
                                            if (data.url) {
                                                window.location.href = data.url;
                                            } else {
                                                alert('Failed to get authorization URL: ' + (data.error || 'Unknown error'));
                                            }
                                        } catch (e) {
                                            alert('Error: ' + e);
                                        }
                                    }}
                                    className="px-4 py-2 bg-[#003087] text-white rounded hover:bg-[#001c64] flex items-center"
                                >
                                    {/* PayPal Logo or Icon can be added here */}
                                    <span className="mr-2">Connect PayPal</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    disabled
                                    className="px-4 py-2 bg-gray-100 text-gray-400 rounded border border-gray-200 cursor-not-allowed flex items-center"
                                >
                                    Connected
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
