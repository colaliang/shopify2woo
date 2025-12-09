import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useUserStore } from "@/stores/userStore";
import supabase from "@/lib/supabase";

export default function LoginModal() {
  const [loading, setLoading] = useState(false);
  const [showWeChat, setShowWeChat] = useState(false);
  const { loginModalOpen, closeLoginModal } = useUserStore();

  useEffect(() => {
    if (loginModalOpen) {
      fetch('/api/utils/ip-check')
        .then(res => res.json())
        .then(data => {
          if (data.isChina) setShowWeChat(true);
        })
        .catch(err => console.error('IP check failed:', err));
    }
  }, [loginModalOpen]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key) {
        alert('未配置 Supabase 环境变量');
        return
      }
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { 
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback` : undefined,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })
    } catch {
      alert('登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleWeChatLogin = () => {
    setLoading(true);
    window.location.href = '/api/auth/wechat/login';
  };

  if (!loginModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={closeLoginModal} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">用户登录</h2>
          <button
            onClick={closeLoginModal}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            使用 Google 登录
          </button>

          {showWeChat && (
            <button
              onClick={handleWeChatLogin}
              disabled={loading}
              className="w-full px-4 py-2 bg-[#07C160] text-white rounded-lg hover:bg-[#06ad56] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              使用微信登录
            </button>
          )}
        </div>
      </div>
    </div>
  );
}