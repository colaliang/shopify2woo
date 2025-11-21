'use client'
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabaseClient'

export default function AuthBar() {
  const [email, setEmail] = useState<string | null>(null)
  const disableAuth = process.env.NEXT_PUBLIC_DISABLE_AUTH === '1'

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    let mounted = true
    ;(async () => {
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
      if (!mounted) return
      setEmail(data.session?.user?.email || null)
    })()
    const sub = supabase?.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email || null)
    })
    return () => { mounted = false; sub?.data.subscription.unsubscribe() }
  }, [])

  function signIn() {
    const supabase = getSupabaseBrowser()
    const redirectTo = typeof window !== 'undefined' ? window.location.href : undefined
    supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  }

  async function signOut() {
    const supabase = getSupabaseBrowser()
    await supabase?.auth.signOut()
    setEmail(null)
    if (typeof window !== 'undefined') window.location.reload()
  }

  return (
    <div className="w-full border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-5xl mx-auto p-3 flex items-center justify-between text-sm">
        {disableAuth ? <div className="px-3 py-1.5 text-gray-700">本地开发模式：免登录</div> : <button onClick={signIn} className="px-3 py-1.5 border rounded">使用 Google 登录</button>}
        <div className="flex-1 text-center text-gray-700">{disableAuth ? '本地环境' : (email ? `已登录：${email}` : '未登录')}</div>
        {!disableAuth && <button onClick={signOut} className="px-3 py-1.5 border rounded">退出登录</button>}
      </div>
    </div>
  )
}

