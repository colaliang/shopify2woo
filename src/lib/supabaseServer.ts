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

export function readLocalConfig() {
  try {
    if (!fs.existsSync(configFile)) return null;
    const raw = fs.readFileSync(configFile, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

type LocalConfig = { wordpressUrl: string; consumerKey: string; consumerSecret: string };

export function writeLocalConfig(cfg: LocalConfig) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}
