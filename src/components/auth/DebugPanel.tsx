'use client'
import { useEffect, useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import supabase from '@/lib/supabase'
import LogItem, { LogItemData } from '@/components/import/LogItem'

 

type HealthResponse = { ok: boolean; env: { supabase_server_url: boolean; supabase_server_key: boolean; supabase_client_url: boolean; supabase_client_key: boolean; runner_token: boolean; image_cache_bucket: string }; supabase: { storage_access: boolean; pgmq_rpc: boolean }; reasons: string[]; ts: string }

export default function DebugPanel() {
  const { debugModalOpen, closeDebugModal } = useUserStore()
  const [active, setActive] = useState<'logs'|'scrape'|'health'>('logs')
  const [defOpen, setDefOpen] = useState<boolean>(false)
  const [logs, setLogs] = useState<LogItemData[]>([])
  const [hLoading, setHLoading] = useState(false)
  const [hError, setHError] = useState<string | null>(null)
  const [hData, setHData] = useState<HealthResponse | null>(null)
  const [url, setUrl] = useState('')
  const [platform, setPlatform] = useState('WordPress')
  const [sLoading, setSLoading] = useState(false)
  const [sError, setSError] = useState<string | null>(null)
  const [sData, setSData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!debugModalOpen) return
    if (active !== 'logs') return
    let mounted = true
    const uid = useUserStore.getState().user?.id || ''
    ;(async () => {
      try {
        const q = supabase
          .from('import_logs')
          .select('level,message,created_at')
          .order('created_at', { ascending: false })
          .limit(200)
        const { data } = uid ? await q.eq('user_id', uid) : await q
        if (mounted) setLogs((data || []).map((d: DbLogRow) => ({ level: d.level, message: d.message, createdAt: d.created_at })))
      } catch {}
    })()
    const ch = supabase.channel('import_logs_channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'import_logs', ...(uid ? { filter: `user_id=eq.${uid}` } : {}) }, (payload) => {
        const n = payload.new as DbLogRow
        setLogs((prev) => [{ level: n.level, message: n.message, createdAt: n.created_at }, ...prev].slice(0, 500))
      })
      .subscribe()
    return () => {
      mounted = false
      try { supabase.removeChannel(ch) } catch {}
    }
  }, [debugModalOpen, active])

  useEffect(() => {
    try { setDefOpen(localStorage.getItem('debugDefaultOpen') === '1') } catch {}
  }, [])
  useEffect(() => {
    try {
      if (defOpen) localStorage.setItem('debugDefaultOpen', '1')
      else localStorage.removeItem('debugDefaultOpen')
    } catch {}
  }, [defOpen])

  async function onHealth() {
    setHLoading(true)
    setHError(null)
    setHData(null)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      const token = process.env.NEXT_PUBLIC_RUNNER_TOKEN || ''
      const u = token ? `/api/import/health?token=${encodeURIComponent(token)}` : `/api/import/health`
      const r = await fetch(u, { cache: 'no-store', signal: controller.signal, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) })
      clearTimeout(timer)
      const j = await r.json().catch(() => null)
      if (!r.ok || !j) {
        setHError(typeof j?.error === 'string' ? j.error : `请求失败 ${r.status}`)
      } else {
        setHData(j as HealthResponse)
      }
    } catch (e) {
      setHError(String((e as Error)?.message || e || 'unknown'))
    } finally {
      setHLoading(false)
    }
  }

  async function onScrape(e: React.FormEvent) {
    e.preventDefault()
    setSLoading(true)
    setSError(null)
    setSData(null)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      const r = await fetch(`/api/debug/scrape?url=${encodeURIComponent(url)}&platform=${encodeURIComponent(platform)}`, { cache: 'no-store', signal: controller.signal })
      clearTimeout(timer)
      const j = await r.json().catch(() => null)
      if (!r.ok || !j) {
        setSError(typeof j?.error === 'string' ? j.error : `请求失败 ${r.status}`)
      } else {
        setSData(j as Record<string, unknown>)
      }
    } catch (e) {
      setSError(String((e as Error)?.message || e || 'unknown'))
    } finally {
      setSLoading(false)
    }
  }

  if (!debugModalOpen) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[380px] sm:w-[480px] md:w-[640px]">
      <div className="bg-gray-900 text-white rounded-lg shadow-xl border border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => setActive('logs')} className={`px-2 py-1 rounded ${active==='logs'?'bg-emerald-600 text-white':''}`}>日志</button>
            <button onClick={() => setActive('scrape')} className={`px-2 py-1 rounded ${active==='scrape'?'bg-emerald-600 text-white':''}`}>抓取测试</button>
            <button onClick={() => setActive('health')} className={`px-2 py-1 rounded ${active==='health'?'bg-emerald-600 text-white':''}`}>健康</button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={defOpen} onChange={(e)=>setDefOpen(e.target.checked)} />
              默认打开
            </label>
            <button onClick={closeDebugModal} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs">关闭</button>
          </div>
        </div>
        <div className="p-3 max-h-[60vh] overflow-y-auto text-sm bg-gray-950 text-gray-100">
          {active === 'logs' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-gray-600">总条目：{logs.length}</div>
                <button onClick={() => setActive('logs')} className="px-2 py-1 border rounded">刷新</button>
              </div>
              <div className="space-y-2">
                {logs.map((lg, i) => (
                  <div key={i} className="border rounded p-2 bg-gray-50">
                    <LogItem data={lg} />
                  </div>
                ))}
                {!logs.length && (<div className="text-gray-500">暂无日志</div>)}
              </div>
            </div>
          )}

          {active === 'scrape' && (
            <div className="space-y-2">
              <form onSubmit={onScrape} className="space-y-2">
                <div className="flex items-center gap-2">
                  <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="border rounded px-2 py-2 bg-gray-900 text-white">
                    <option value="WordPress">WordPress</option>
                    <option value="Shopify">Shopify</option>
                    <option value="Wix">Wix</option>
                  </select>
                  <input value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="输入产品页面URL" className="flex-1 border rounded px-3 py-2 bg-gray-900 text-white placeholder-gray-400" />
                </div>
                <button disabled={!url || sLoading} className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">{sLoading?"请求中...":"抓取"}</button>
              </form>
              {sError ? (<div className="text-red-600 text-xs">{sError}</div>) : null}
              {sData ? (
                <div>
                  <div className="mb-1">最终URL：{String((sData as Record<string, unknown>)?.finalUrl||"")}</div>
                  <div className="mb-1">内容类型：{String((sData as Record<string, unknown>)?.contentType||"")}</div>
                  <div className="mb-1">名称：{String((sData as Record<string, unknown>)?.name||"")}</div>
                  <div className="mb-1">SKU：{String((sData as Record<string, unknown>)?.skuRaw||"")} → {String((sData as Record<string, unknown>)?.skuNormalized||"")}</div>
                  <div className="mt-2 border border-gray-800 rounded p-2 whitespace-pre-wrap text-xs">{JSON.stringify(sData, null, 2)}</div>
                </div>
              ) : null}
            </div>
          )}

          {active === 'health' && (
            <div className="space-y-2">
              <button onClick={onHealth} disabled={hLoading} className="px-3 py-1.5 bg-emerald-600 text-white rounded disabled:opacity-50">{hLoading?"检查中...":"健康检查"}</button>
              {hError ? (<div className="text-red-600 text-xs">{hError}</div>) : null}
              {hData ? (
                <div>
                  <div className="mb-1">服务可用：{String(hData.ok)}</div>
                  <div className="mb-1">Supabase存储：{String(hData.supabase.storage_access)}</div>
                  <div className="mb-1">PGMQ RPC：{String(hData.supabase.pgmq_rpc)}</div>
                  <div className="mt-2 border border-gray-800 rounded p-2 whitespace-pre-wrap text-xs">{JSON.stringify(hData, null, 2)}</div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
  type DbLogRow = { level: 'info' | 'error'; message: string; created_at: string }