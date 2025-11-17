import { createClient } from "@supabase/supabase-js";
const userCache = new Map<string, { uid: string | null; exp: number }>();
let failCount = 0;
let lastFail = 0;

export function getSupabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    return createClient(url, key);
  }
  return null;
}

// 本地配置缓存（Edge/浏览器安全实现，无文件系统）
type LocalConfig = { wordpressUrl: string; consumerKey: string; consumerSecret: string };
type LocalConfigStore = { users?: Record<string, LocalConfig> } & Partial<LocalConfig>;
const globalAny = globalThis as any;
function getMemStore(): LocalConfigStore {
  if (!globalAny.__localConfigStore) globalAny.__localConfigStore = {};
  return globalAny.__localConfigStore as LocalConfigStore;
}
export function readLocalConfig(userId?: string) {
  try {
    const data = getMemStore();
    if (userId) {
      if (data && typeof data === "object" && data.users && data.users[userId]) return data.users[userId];
      if (data && (data as LocalConfig).wordpressUrl) return data as LocalConfig;
      return null;
    }
    return (data && (data as LocalConfig).wordpressUrl) ? (data as LocalConfig) : null;
  } catch {
    return null;
  }
}
export function writeLocalConfig(cfg: LocalConfig, userId?: string) {
  try {
    const store = getMemStore();
    if (userId) {
      if (!store.users || typeof store.users !== "object") store.users = {};
      store.users[userId] = cfg;
    } else {
      Object.assign(store, cfg);
    }
    return true;
  } catch {
    return false;
  }
}
export function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (url && key) return createClient(url, key);
  return null;
}

function getSupabaseAuthClientPreferAnon() {
  const anon = getSupabaseAnon();
  if (anon) return anon;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const srv = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (url && srv) return createClient(url, srv);
  return null;
}

export async function getUserIdFromToken(token?: string) {
  if (!token) return null;
  const supabase = getSupabaseAuthClientPreferAnon();
  if (!supabase) return null;
  const now = Date.now();
  const cached = userCache.get(token);
  if (cached && cached.exp > now) return cached.uid;
  const ms = parseInt(process.env.SUPABASE_TIMEOUT_MS || "5000", 10) || 5000;
  if (failCount >= 3 && now - lastFail < 120000) {
    userCache.set(token, { uid: null, exp: now + 60000 });
    return null;
  }
  try {
    const { data } = await withTimeout(supabase.auth.getUser(token), ms);
    const uid = data.user?.id || null;
    userCache.set(token, { uid, exp: now + (uid ? 300000 : 60000) });
    failCount = 0;
    return uid;
  } catch {
    failCount++;
    lastFail = now;
    userCache.set(token, { uid: null, exp: now + 60000 });
    return null;
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}
