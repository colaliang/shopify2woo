'use client'

import { useState, useEffect } from 'react'
import supabase from '@/lib/supabase'
import { CheckCircle, AlertCircle } from 'lucide-react'

export default function AdminSettingsPage() {
    const [paypalStatus, setPaypalStatus] = useState<{
        connected: boolean;
        merchantName?: string;
        merchantEmail?: string;
        stripe?: {
            connected: boolean;
            merchantName?: string;
            merchantEmail?: string;
        };
        wechat?: {
            connected: boolean;
            mchId?: string;
        };
    } | null>(null);

    const [wechatModalOpen, setWechatModalOpen] = useState(false);
    const [wechatForm, setWechatForm] = useState({
        appId: '',
        mchId: '',
        apiKey: '',
        notifyUrl: '',
        certContent: ''
    });

    async function handleWechatSave(e: React.FormEvent) {
        e.preventDefault();
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/payment/wechat/config', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify(wechatForm)
            });

            if (res.ok) {
                alert('WeChat Pay Config Saved!');
                setWechatModalOpen(false);
                window.location.reload();
            } else {
                const err = await res.json();
                alert('Failed to save: ' + err.error);
            }
        } catch (e) {
            alert('Error: ' + e);
        }
    }

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
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled
                                        className="px-4 py-2 bg-gray-100 text-gray-400 rounded border border-gray-200 cursor-not-allowed flex items-center"
                                    >
                                        Connected
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if(!confirm('This will reconnect your PayPal account. Continue?')) return;
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
                                        className="px-3 py-2 text-blue-600 hover:bg-blue-50 rounded text-sm"
                                    >
                                        Reconnect
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Stripe Integration */}
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-medium text-gray-900">Stripe</h3>
                                    {paypalStatus?.stripe?.connected && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Connected
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-500 mb-1">Accept credit cards and more via Stripe Connect.</p>
                                {paypalStatus?.stripe?.connected && (
                                    <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded mt-2 border border-gray-100">
                                        <p><strong>Merchant:</strong> {paypalStatus.stripe.merchantName || 'N/A'}</p>
                                        <p><strong>Email:</strong> {paypalStatus.stripe.merchantEmail || 'N/A'}</p>
                                    </div>
                                )}
                            </div>
                            
                            {!paypalStatus?.stripe?.connected ? (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            const { data: { session } } = await supabase.auth.getSession();
                                            const res = await fetch('/api/admin/payment/stripe/auth-url', {
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
                                    className="px-4 py-2 bg-[#635BFF] text-white rounded hover:bg-[#544dc9] flex items-center"
                                >
                                    <span className="mr-2">Connect Stripe</span>
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                     <button
                                        type="button"
                                        disabled
                                        className="px-4 py-2 bg-gray-100 text-gray-400 rounded border border-gray-200 cursor-not-allowed flex items-center"
                                    >
                                        Connected
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if(!confirm('This will reconnect your Stripe account. Continue?')) return;
                                            try {
                                                const { data: { session } } = await supabase.auth.getSession();
                                                const res = await fetch('/api/admin/payment/stripe/auth-url', {
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
                                        className="px-3 py-2 text-blue-600 hover:bg-blue-50 rounded text-sm"
                                    >
                                        Reconnect
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if(!confirm('Are you sure you want to disconnect Stripe?')) return;
                                            try {
                                                const { data: { session } } = await supabase.auth.getSession();
                                                const res = await fetch('/api/admin/payment/stripe/disconnect', {
                                                    method: 'POST',
                                                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                                                });
                                                if (res.ok) {
                                                    alert('Stripe disconnected.');
                                                    window.location.reload();
                                                } else {
                                                    alert('Failed to disconnect');
                                                }
                                            } catch (e) {
                                                alert('Error: ' + e);
                                            }
                                        }}
                                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded text-sm"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* WeChat Pay Integration */}
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-medium text-gray-900">WeChat Pay</h3>
                                    {paypalStatus?.wechat?.connected && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Configured
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-500 mb-1">Accept payments via WeChat Pay (V2 XML API).</p>
                                {paypalStatus?.wechat?.connected && (
                                    <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded mt-2 border border-gray-100">
                                        <p><strong>MCHID:</strong> {paypalStatus.wechat.mchId || 'N/A'}</p>
                                    </div>
                                )}
                            </div>
                            
                            <button
                                type="button"
                                onClick={() => setWechatModalOpen(true)}
                                className="px-4 py-2 bg-[#07C160] text-white rounded hover:bg-[#06ad56] flex items-center"
                            >
                                <span className="mr-2">{paypalStatus?.wechat?.connected ? 'Edit Config' : 'Configure'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* WeChat Config Modal */}
            {wechatModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">WeChat Pay Configuration</h2>
                        <form onSubmit={handleWechatSave} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">AppID</label>
                                <input 
                                    type="text" required
                                    className="w-full border rounded px-3 py-2 mt-1"
                                    value={wechatForm.appId}
                                    onChange={e => setWechatForm({...wechatForm, appId: e.target.value})}
                                    placeholder="wx..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Merchant ID (MCHID)</label>
                                <input 
                                    type="text" required
                                    className="w-full border rounded px-3 py-2 mt-1"
                                    value={wechatForm.mchId}
                                    onChange={e => setWechatForm({...wechatForm, mchId: e.target.value})}
                                    placeholder="1234567890"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">API Key (V2)</label>
                                <input 
                                    type="password" required
                                    className="w-full border rounded px-3 py-2 mt-1"
                                    value={wechatForm.apiKey}
                                    onChange={e => setWechatForm({...wechatForm, apiKey: e.target.value})}
                                    placeholder="32-char MD5 Key"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Notify URL (Optional)</label>
                                <input 
                                    type="url"
                                    className="w-full border rounded px-3 py-2 mt-1"
                                    value={wechatForm.notifyUrl}
                                    onChange={e => setWechatForm({...wechatForm, notifyUrl: e.target.value})}
                                    placeholder="https://..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">API Cert Content (PEM/P12 Base64)</label>
                                <textarea 
                                    className="w-full border rounded px-3 py-2 mt-1 text-xs font-mono"
                                    rows={3}
                                    value={wechatForm.certContent}
                                    onChange={e => setWechatForm({...wechatForm, certContent: e.target.value})}
                                    placeholder="Paste certificate content here if needed for refunds..."
                                />
                            </div>
                            
                            <div className="flex justify-end gap-2 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setWechatModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
