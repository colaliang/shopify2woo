'use client';

import { useUserStore } from '@/stores/userStore';
import { X, Check, CreditCard, MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

const packages = [
  { id: 'basic', credits: 300, price: 2.99, name: 'Basic' },
  { id: 'pro', credits: 1500, price: 9.99, name: 'Professional', popular: true },
  { id: 'max', credits: 10000, price: 39.99, name: 'Enterprise' },
];

export default function RechargeModal() {
  const { rechargeModalOpen, closeRechargeModal, user } = useUserStore();
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'wechat'>('stripe');
  const [loading, setLoading] = useState(false);

  // Auto-detect payment method based on IP (mock logic for now, can be improved)
  useEffect(() => {
    // Check if user is likely Chinese based on browser language or timezone
    const isChinese = navigator.language.includes('zh') || Intl.DateTimeFormat().resolvedOptions().timeZone.includes('Shanghai');
    if (isChinese) {
        setPaymentMethod('wechat');
    }
  }, []);

  if (!rechargeModalOpen) return null;

  const handlePurchase = async (pkg: typeof packages[0]) => {
    setLoading(true);
    try {
        const res = await fetch('/api/payment/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packageId: pkg.id, paymentMethod })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Create order failed');

        const { paymentUrl } = data;
        
        // Open payment URL in new window/tab
        const width = 500;
        const height = 600;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        const popup = window.open(
            paymentUrl, 
            'PaymentGateway', 
            `width=${width},height=${height},left=${left},top=${top}`
        );

        // Listen for success message from popup (if same origin or postMessage used)
        const checkInterval = setInterval(async () => {
            if (popup?.closed) {
                clearInterval(checkInterval);
                // Refresh credits when popup closes (optimistic)
                const { useUserStore } = await import('@/stores/userStore');
                useUserStore.getState().refreshCredits();
                setLoading(false);
            }
        }, 1000);

        // Also listen for postMessage
        const onMessage = async (event: MessageEvent) => {
            if (event.data === 'payment_success') {
                clearInterval(checkInterval);
                const { useUserStore } = await import('@/stores/userStore'); // Dynamically import to avoid hook rules in callback? Actually store is global.
                // Better: useUserStore.getState().refreshCredits();
                // But we can just use closeRechargeModal() here too.
                alert('Recharge Successful!');
                useUserStore.getState().refreshCredits();
                closeRechargeModal();
                setLoading(false);
            }
        };
        window.addEventListener('message', onMessage);

    } catch (error) {
        console.error('Payment failed', error);
        alert(`Payment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
             <h2 className="text-xl font-bold text-gray-900">Recharge Credits (积分充值)</h2>
             <p className="text-sm text-gray-500 mt-1">Current Balance: <span className="font-bold text-blue-600">{user?.credits ?? 0}</span> Credits</p>
          </div>
          <button onClick={closeRechargeModal} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          
          {/* Payment Method Selection */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Select Payment Method</h3>
            <div className="flex gap-4">
                <button
                    onClick={() => setPaymentMethod('wechat')}
                    className={`flex-1 p-4 rounded-lg border-2 flex items-center justify-center gap-3 transition-all ${
                        paymentMethod === 'wechat' 
                        ? 'border-green-500 bg-green-50 text-green-700' 
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                >
                    <MessageCircle className="w-6 h-6" /> {/* Lucide doesn't have WeChat icon, using MessageCircle as proxy */}
                    <span className="font-medium">WeChat Pay (微信支付)</span>
                </button>
                <button
                    onClick={() => setPaymentMethod('stripe')}
                    className={`flex-1 p-4 rounded-lg border-2 flex items-center justify-center gap-3 transition-all ${
                        paymentMethod === 'stripe' 
                        ? 'border-blue-500 bg-blue-50 text-blue-700' 
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                >
                    <CreditCard className="w-6 h-6" />
                    <span className="font-medium">Credit Card (Stripe)</span>
                </button>
            </div>
          </div>

          {/* Packages */}
          <div className="grid md:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <div 
                key={pkg.id} 
                className={`relative rounded-xl border-2 p-6 flex flex-col ${
                    pkg.popular ? 'border-blue-500 shadow-lg ring-1 ring-blue-500/20' : 'border-gray-200 hover:border-blue-200'
                }`}
              >
                {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                        MOST POPULAR
                    </div>
                )}
                
                <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">{pkg.name}</h3>
                    <div className="mt-2 flex items-baseline justify-center gap-1">
                        <span className="text-3xl font-bold text-gray-900">${pkg.price}</span>
                        <span className="text-sm text-gray-500">USD</span>
                    </div>
                    <div className="mt-4 text-blue-600 font-bold text-xl">
                        {pkg.credits} Credits
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        ${(pkg.price / pkg.credits).toFixed(3)} / credit
                    </div>
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                    <li className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-500" />
                        <span>Valid forever</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-500" />
                        <span>Import {pkg.credits} products</span>
                    </li>
                </ul>

                <button
                    onClick={() => handlePurchase(pkg)}
                    disabled={loading}
                    className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                        pkg.popular 
                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                    {loading ? 'Processing...' : 'Buy Now'}
                </button>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
