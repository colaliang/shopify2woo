'use client'

import { useState } from 'react'
import supabase from '@/lib/supabase'

export default function AdminSettingsPage() {
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
                                <h3 className="font-medium text-gray-900">PayPal</h3>
                                <p className="text-sm text-gray-500">Connect your PayPal account to accept payments directly.</p>
                            </div>
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
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
