import { getSupabaseServer } from "./supabaseServer";
import fs from "fs";
import path from "path";

type Job = {
  requestId: string;
  userId: string;
  source: string;
  total: number;
  processed: number;
  successCount: number;
  errorCount: number;
  status: "queued" | "running" | "done" | "error";
  createdAt: string;
  updatedAt: string;
};

const dataDir = path.join(process.cwd(), ".data");
const jobsFile = path.join(dataDir, "import-jobs.json");

function readLocal(): Record<string, Job> {
  try {
    if (!fs.existsSync(jobsFile)) return {};
    const raw = fs.readFileSync(jobsFile, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeLocal(map: Record<string, Job>) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    fs.writeFileSync(jobsFile, JSON.stringify(map, null, 2), "utf-8");
  } catch {}
}

export async function createJob(userId: string, source: string, requestId: string, total: number) {
  const now = new Date().toISOString();
  const job: Job = { requestId, userId, source, total, processed: 0, successCount: 0, errorCount: 0, status: "running", createdAt: now, updatedAt: now };
  const supabase = getSupabaseServer();
  if (supabase) {
    await supabase.from("import_jobs").upsert({ request_id: requestId, user_id: userId, source, total, processed: 0, success_count: 0, error_count: 0, status: "running" }, { onConflict: "request_id" });
    return;
  }
  const map = readLocal();
  map[requestId] = job;
  writeLocal(map);
}

export async function updateJob(userId: string, requestId: string, delta: { processed?: number; success?: number; error?: number }) {
  const supabase = getSupabaseServer();
  if (supabase) {
    const incProcessed = delta.processed ?? 0;
    const incSuccess = delta.success ?? 0;
    const incError = delta.error ?? 0;
    const { data } = await supabase.from("import_jobs").select("processed, success_count, error_count").eq("request_id", requestId).eq("user_id", userId).limit(1).maybeSingle();
    const processed = (data?.processed || 0) + incProcessed;
    const success_count = (data?.success_count || 0) + incSuccess;
    const error_count = (data?.error_count || 0) + incError;
    await supabase.from("import_jobs").update({ processed, success_count, error_count }).eq("request_id", requestId).eq("user_id", userId);
    return;
  }
  const map = readLocal();
  const job = map[requestId];
  if (!job || job.userId !== userId) return;
  job.processed += delta.processed ?? 0;
  job.successCount += delta.success ?? 0;
  job.errorCount += delta.error ?? 0;
  job.updatedAt = new Date().toISOString();
  writeLocal(map);
}

export async function finishJob(userId: string, requestId: string, status: "done" | "error") {
  const supabase = getSupabaseServer();
  if (supabase) {
    await supabase.from("import_jobs").update({ status }).eq("request_id", requestId).eq("user_id", userId);
    return;
  }
  const map = readLocal();
  const job = map[requestId];
  if (!job || job.userId !== userId) return;
  job.status = status;
  job.updatedAt = new Date().toISOString();
  writeLocal(map);
}

export async function getJob(userId: string, requestId: string): Promise<Job | null> {
  const supabase = getSupabaseServer();
  if (supabase) {
    const { data } = await supabase.from("import_jobs").select("request_id, user_id, source, total, processed, success_count, error_count, status, created_at, updated_at").eq("request_id", requestId).eq("user_id", userId).limit(1).maybeSingle();
    if (!data) return null;
    return {
      requestId: data.request_id,
      userId: data.user_id,
      source: data.source,
      total: data.total || 0,
      processed: data.processed || 0,
      successCount: data.success_count || 0,
      errorCount: data.error_count || 0,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    } as Job;
  }
  const map = readLocal();
  const job = map[requestId];
  if (!job || job.userId !== userId) return null;
  return job;
}

