import { createClient } from "@supabase/supabase-js";

export function getSupabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    return createClient(url, key);
  }
  return null;
}

// 本地文件回退：开发环境无 Supabase 时使用
import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), ".data");
const configFile = path.join(dataDir, "config.json");

export function readLocalConfig(userId?: string) {
  try {
    if (!fs.existsSync(configFile)) return null;
    const raw = fs.readFileSync(configFile, "utf-8");
    const data = JSON.parse(raw);
    if (userId) {
      if (data && typeof data === "object" && data.users && data.users[userId]) return data.users[userId];
      if (data && data.wordpressUrl) return data;
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

type LocalConfig = { wordpressUrl: string; consumerKey: string; consumerSecret: string };
type LocalConfigStore = { users?: Record<string, LocalConfig> } & Partial<LocalConfig>;

export function writeLocalConfig(cfg: LocalConfig, userId?: string) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    let out: LocalConfigStore = {};
    if (fs.existsSync(configFile)) {
      try {
        out = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      } catch {
        out = {};
      }
    }
    if (userId) {
      if (!out.users || typeof out.users !== "object") out.users = {};
      out.users[userId] = cfg;
    } else {
      out = cfg;
    }
    fs.writeFileSync(configFile, JSON.stringify(out, null, 2), "utf-8");
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

export async function getUserIdFromToken(token?: string) {
  if (!token) return null;
  const supabase = getSupabaseAnon();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser(token);
  return data.user?.id || null;
}
