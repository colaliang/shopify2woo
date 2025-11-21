import { getSupabaseServer } from "./supabaseServer";

type LogItem = { userId: string; requestId: string; level: "info" | "error"; message: string; createdAt: string };

type DbLogRow = {
  level: "info" | "error";
  message: string;
  created_at: string;
};

const globalObj = globalThis as unknown as { __importLogs?: LogItem[] };
function readLocal(): LogItem[] {
  try { return Array.isArray(globalObj.__importLogs) ? globalObj.__importLogs as LogItem[] : []; } catch { return []; }
}
function writeLocal(arr: LogItem[]) {
  try { (globalThis as unknown as { __importLogs?: LogItem[] }).__importLogs = arr; } catch {}
}

function getCallerLocation() {
  try {
    const err = new Error();
    const stack = String(err.stack || "");
    const lines = stack.split(/\r?\n/).slice(1);
    for (const ln of lines) {
      if (!ln) continue;
      if (ln.includes("logs.ts")) continue;
      // Patterns: " at func (path:line:col)" or " at path:line:col"
      const m = ln.match(/\((.*?):(\d+):(\d+)\)/) || ln.match(/\sat\s(.*?):(\d+):(\d+)/);
      if (m) {
        const full = m[1];
        const line = m[2];
        // Normalize to project-relative if possible
        const idx = full.indexOf("shopify2woo-web");
        const rel = idx >= 0 ? full.slice(idx) : full;
        return `${rel}:${line}`;
      }
    }
  } catch {}
  return "";
}

export async function appendLog(userId: string, requestId: string, level: "info" | "error", message: string) {
  const supabase = getSupabaseServer();
  const now = new Date().toISOString();
  const loc = getCallerLocation();
  const msg = loc ? `${message} @loc=${loc}` : message;
  if (supabase) {
    await supabase.from("import_logs").insert({ user_id: userId, request_id: requestId, level, message: msg });
    return;
  }
  const arr = readLocal();
  arr.push({ userId, requestId, level, message: msg, createdAt: now });
  writeLocal(arr);
}

export async function listLogs(userId: string, requestId: string, limit = 200) {
  const supabase = getSupabaseServer();
  if (supabase) {
    const q = supabase
      .from("import_logs")
      .select("level, message, created_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(limit);
    const { data } = userId === "__ALL__" ? await q : await q.eq("user_id", userId);
    return (data || []).map((d: DbLogRow) => ({ level: d.level, message: d.message, createdAt: d.created_at }));
  }
  return readLocal()
    .filter((l) => (userId === "__ALL__" ? l.requestId === requestId : (l.userId === userId && l.requestId === requestId)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
    .map((d) => ({ level: d.level, message: d.message, createdAt: d.createdAt }));
}

