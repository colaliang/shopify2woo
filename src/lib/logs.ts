import { getSupabaseServer } from "./supabaseServer";
import fs from "fs";
import path from "path";

type LogItem = { userId: string; requestId: string; level: "info" | "error"; message: string; createdAt: string };

const dataDir = path.join(process.cwd(), ".data");
const logsFile = path.join(dataDir, "import-logs.json");

function readLocal(): LogItem[] {
  try {
    if (!fs.existsSync(logsFile)) return [];
    const raw = fs.readFileSync(logsFile, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeLocal(arr: LogItem[]) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    fs.writeFileSync(logsFile, JSON.stringify(arr, null, 2), "utf-8");
  } catch {}
}

export async function appendLog(userId: string, requestId: string, level: "info" | "error", message: string) {
  const supabase = getSupabaseServer();
  const now = new Date().toISOString();
  if (supabase) {
    await supabase.from("import_logs").insert({ user_id: userId, request_id: requestId, level, message });
    return;
  }
  const arr = readLocal();
  arr.push({ userId, requestId, level, message, createdAt: now });
  writeLocal(arr);
}

export async function listLogs(userId: string, requestId: string, limit = 200) {
  const supabase = getSupabaseServer();
  if (supabase) {
    const { data } = await supabase
      .from("import_logs")
      .select("level, message, created_at")
      .eq("user_id", userId)
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data || []).map((d: any) => ({ level: d.level, message: d.message, createdAt: d.created_at }));
  }
  return readLocal()
    .filter((l) => l.userId === userId && l.requestId === requestId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
    .map((d) => ({ level: d.level, message: d.message, createdAt: d.createdAt }));
}

