import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Send } from 'lucide-react';
import { useUserStore } from '@/stores/userStore';
import supabase from '@/lib/supabase';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export default function ContactModal() {
  const { contactModalOpen, closeContactModal, user } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    description: '',
    category: '',
    contact_info: '',
    token: ''
  });

  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (contactModalOpen) {
      // Reset form when opening
      setFormData({
        description: '',
        category: '功能建议',
        contact_info: user?.email || '',
        token: ''
      });
      setSuccess(false);
      setError(null);
    }
  }, [contactModalOpen, user]);

  // Load Turnstile script
  useEffect(() => {
    if (!contactModalOpen) return;

    const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY;
    if (!siteKey) return;

    const loadTurnstile = () => {
      if (window.turnstile && turnstileRef.current) {
        if (widgetIdRef.current) window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: siteKey,
          callback: (token: string) => setFormData(prev => ({ ...prev, token })),
        });
      }
    };

    if (!window.turnstile) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = loadTurnstile;
      document.body.appendChild(script);
    } else {
      loadTurnstile();
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [contactModalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败');

      setSuccess(true);
      setTimeout(() => {
        closeContactModal();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (!contactModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-black/50" onClick={closeContactModal} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-auto flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">联系我们</h2>
          <button
            onClick={closeContactModal}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {success ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <Send className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-medium text-gray-900">提交成功</h3>
              <p className="text-gray-500">感谢您的反馈，我们会尽快处理。</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  问题分类 <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                >
                  <option value="" disabled>请选择分类</option>
                  <option value="功能建议">✨ 功能建议</option>
                  <option value="Bug反馈">🐛 Bug反馈</option>
                  <option value="账号问题">👤 账号问题</option>
                  <option value="充值问题">💰 充值问题</option>
                  <option value="商务合作">🤝 商务合作</option>
                  <option value="其他">📝 其他</option>
                </select>
              </div>

              {/* Contact Info */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  联系方式 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="邮箱或手机号"
                  value={formData.contact_info}
                  onChange={e => setFormData({...formData, contact_info: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  详细描述 <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="请详细描述您的需求或遇到的问题..."
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all resize-none"
                />
              </div>

              {/* Turnstile */}
              <div ref={turnstileRef} className="min-h-[65px]" />

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 focus:ring-4 focus:ring-primary-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    提交中...
                  </>
                ) : (
                  '提交'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
