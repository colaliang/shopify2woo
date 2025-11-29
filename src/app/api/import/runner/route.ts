import { NextResponse } from "next/server";
import { getSupabaseServer, readLocalConfig, getUserIdFromToken, withTimeout } from "@/lib/supabaseServer";
import { pgmqQueueName, pgmqRead, pgmqDelete, pgmqSetVt, pgmqArchive, pgmqPurgeRequest } from "@/lib/pgmq";
import { appendLog } from "@/lib/logs";
import { buildWpPayloadFromHtml, fetchHtmlMeta } from "@/lib/wordpressScrape";
import { wooPost, wooPut, ensureTerms, type WooConfig } from "@/lib/woo";
import { recordResult } from "@/lib/history";
import { processShopifyJob, ShopifyJobMessage } from "@/lib/shopifyRunner";
import { processWixJob, WixJobMessage } from "@/lib/wixRunner";

export const runtime = "nodejs";

async function isRequestCanceled(userId: string, requestId: string) {
  const supabase = getSupabaseServer();
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from("import_logs")
      .select("message, created_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(10);
    return (data || []).some((d: { message?: string }) => {
      const m = d?.message || "";
      return m.includes("任务已停止（用户取消）") || m.includes("canceled by user");
    });
  } catch {
    return false;
  }
}

async function isRequestStopped(userId: string, requestId: string) {
  const supabase = getSupabaseServer();
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from("import_logs")
      .select("message")
      .eq("request_id", requestId)
      .or("message.ilike.%任务已停止%,message.ilike.%canceled%,message.ilike.%completed%")
      .limit(1);
    return (data && data.length > 0);
  } catch {
    return false;
  }
}

async function auth(req: Request) {
  if (process.env.RUNNER_ALLOW_ANON === "1") return true;
  if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "1" || process.env.DISABLE_AUTH === "1") return true;
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (bearer) {
    const uid = await getUserIdFromToken(bearer);
    if (uid) return true;
  }
  const token = process.env.RUNNER_TOKEN || "";
  if (!token) return true;
  const url = new URL(req.url);
  const qp = url.searchParams.get("token") || "";
  if (qp && qp === token) return true;
  if (bearer && bearer === token) return true;
  return false;
}

async function getWooConfigForUser(userId: string) {
  const supabase = getSupabaseServer();
  let wordpressUrl = "";
  let consumerKey = "";
  let consumerSecret = "";
  if (supabase) {
    const { data } = await supabase
      .from("user_configs")
      .select("wordpress_url, consumer_key, consumer_secret")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    wordpressUrl = data?.wordpress_url || "";
    consumerKey = data?.consumer_key || "";
    consumerSecret = data?.consumer_secret || "";
  }
  if (!wordpressUrl && !consumerKey && !consumerSecret) {
    const local = readLocalConfig(userId) || readLocalConfig();
    wordpressUrl = local?.wordpressUrl || "";
    consumerKey = local?.consumerKey || "";
    consumerSecret = local?.consumerSecret || "";
  }
  if (!wordpressUrl && !consumerKey && !consumerSecret) {
    const envUrl = process.env.NEXT_PUBLIC_WOO_TEST_URL || "";
    const envKey = process.env.NEXT_PUBLIC_WOO_TEST_KEY || "";
    const envSec = process.env.NEXT_PUBLIC_WOO_TEST_SECRET || "";
    wordpressUrl = envUrl || wordpressUrl;
    consumerKey = envKey || consumerKey;
    consumerSecret = envSec || consumerSecret;
  }
  if (!wordpressUrl || !consumerKey || !consumerSecret) return null;
  return { url: wordpressUrl, consumerKey, consumerSecret } as WooConfig;
}

async function processWordpressJob(queue: string, msg: { msg_id: number; message: unknown; read_ct?: number }) {
  const payload = (msg.message || {}) as { userId?: string; requestId?: string; link?: string };
  const userId = String(payload.userId || "");
  const requestId = String(payload.requestId || "");
  const link = String(payload.link || "");
  if (!userId || !requestId || !link) {
    await pgmqDelete(queue, msg.msg_id);
    return { ok: false, reason: "missing_fields" };
  }
  const cfg = await getWooConfigForUser(userId);
  if (!cfg) {
    await appendLog(userId, requestId, "error", "runner: missing Woo config");
    await pgmqSetVt(queue, msg.msg_id, 60);
    return { ok: false, reason: "missing_config" };
  }
  try {
    if (await isRequestCanceled(userId, requestId)) {
      await appendLog(userId, requestId, "info", `request canceled, dropping msg=${msg.msg_id}`);
      await pgmqDelete(queue, msg.msg_id);
      // Double check: try to purge again just in case
      await pgmqPurgeRequest(requestId).catch(()=>{});
      return { ok: false, reason: "canceled" };
    }
    
    // Check if message is stale (older than current active request)
    try {
      const supabase = getSupabaseServer();
      if (supabase) {
        // Get the LATEST request_id for this user that is NOT completed/canceled? 
        // Actually, simpler: check if there is a NEWER request_id for this user that started AFTER this message was enqueued?
        // Or better: when user starts a new import, we should probably mark old ones as canceled?
        // But for now, let's just check if the message timestamp is too old relative to the request creation time?
        // Actually, the requirement is: "Compare with current task timestamp".
        // We don't easily know the "current task timestamp" without querying DB for the request record.
        // Let's assume if we find a newer request for the same user, we might want to drop this one?
        // But user might run parallel requests.
        // Requirement: "If new task gets old message".
        // This implies we should check if the message belongs to an OLD request that was supposedly finished/stopped.
        // We can check import_logs for "任务已停止" for this requestId.
        if (await isRequestStopped(userId, requestId)) {
           await appendLog(userId, requestId, "info", `request previously stopped, dropping stale msg=${msg.msg_id}`);
           await pgmqDelete(queue, msg.msg_id);
           return { ok: false, reason: "stale_stopped" }; 
        }
      }
    } catch {}
    await appendLog(userId, requestId, "info", `runner: fetching ${link}`);
    const meta = await fetchHtmlMeta(link);
    const built = buildWpPayloadFromHtml(meta.html, link, meta.finalUrl);

    // Deduplicate: if this item already has a final result (by slug/sku/link), drop message
    try {
      const supabase = getSupabaseServer();
      const keys = [built.slug, built.sku, link].filter(Boolean) as string[];
      if (supabase && keys.length) {
        const { data: existing } = await supabase
          .from("import_results")
          .select("id, status, action")
          .eq("request_id", requestId)
          .in("item_key", keys)
          .limit(1)
          .maybeSingle();
        // Check if it's success OR if it's an update success.
        // Actually, if we are retrying, we might have a previous partial/error result, which is fine to retry.
        // But if we have 'success', we should skip.
        if (existing && existing.status === "success") {
          await appendLog(userId, requestId, "info", `duplicate message detected (already success) for keys=${JSON.stringify(keys)}, dropping msg=${msg.msg_id}`);
          await pgmqDelete(queue, msg.msg_id);
          return { ok: false, reason: "duplicate_item" };
        }
      }
    } catch {}
    try {
      const cats = Array.isArray((built as unknown as { catNames?: string[] }).catNames) ? (built as unknown as { catNames?: string[] }).catNames! : [];
      const tags = Array.isArray((built as unknown as { tagNames?: string[] }).tagNames) ? (built as unknown as { tagNames?: string[] }).tagNames! : [];
      const ctx = { userId, requestId, productHandle: built.slug || built.sku };
      const catTerms = cats.length ? await ensureTerms(cfg, "category", cats, ctx) : [];
      const tagTerms = tags.length ? await ensureTerms(cfg, "tag", tags, ctx) : [];
      if (Array.isArray(catTerms) && catTerms.length) {
        (built.payload as Record<string, unknown>).categories = catTerms.map((t) => ({ id: t.id }));
      }
      if (Array.isArray(tagTerms) && tagTerms.length) {
        (built.payload as Record<string, unknown>).tags = tagTerms.map((t) => ({ id: t.id }));
      }
    } catch (e) {
      await appendLog(userId, requestId, "error", `ensure terms failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    const base = `index.php/wp-json/wc/v3/products`;
    let res = await wooPost(cfg, base, built.payload, { userId, requestId, productHandle: built.slug || built.sku }, { retries: 0 });
    let ct = res.headers.get("content-type") || "";
    let txt = await res.text();
    
      // Improved JSON parsing and error handling
      let productId: number | undefined = undefined;
      let name: string | undefined = undefined;
      let parseError = false;
      let responseData: any = {};

      try {
        const j = JSON.parse(txt);
        responseData = j;
        productId = Number(j?.id || 0) || undefined;
        name = String(j?.name || built.payload?.name || "");
      } catch {
        parseError = true;
      }
      
      // If we got an "invalid_sku" or "slug_already_exists" (implied by 400/invalid_sku), try to find and update
      if (!parseError && !productId && (responseData?.code === "product_invalid_sku" || responseData?.code === "product_invalid_slug")) {
        const existingId = responseData?.data?.resource_id;
        if (existingId) {
           await appendLog(userId, requestId, "info", `Product already exists (id=${existingId}), attempting update...`);
           const updateEndpoint = `${base}/${existingId}`;
           res = await wooPut(cfg, updateEndpoint, built.payload, { userId, requestId, productHandle: built.slug || built.sku }, { retries: 0 });
           ct = res.headers.get("content-type") || "";
           txt = await res.text();
           // Re-parse response
           try {
             const j = JSON.parse(txt);
             responseData = j;
             productId = Number(j?.id || 0) || undefined;
             name = String(j?.name || built.payload?.name || "");
           } catch {
             parseError = true;
           }
        }
      }

      const ok = res.ok && /application\/json/i.test(ct) && productId && !parseError;

      if (ok) {
        await recordResult(userId, "wordpress", requestId, built.slug || built.sku || link, name, productId, "success", undefined, "update"); // Mark as update/add success
        await appendLog(userId, requestId, "info", `product processed id=${productId || "?"} name=${name || ""}`);
        try {
          await pgmqDelete(queue, msg.msg_id);
        } catch (delErr) {
           await appendLog(userId, requestId, "error", `[WARN] processed success but failed to delete msg=${msg.msg_id}: ${delErr}`);
           // Do not throw, allow success return so we don't retry logic
        }
        return { ok: true };
      } else {
        // Non-exception failure: apply retry policy
        const readCt = msg.read_ct || 1;
        const maxRetries = parseInt(process.env.IMAGE_UPLOAD_RETRY || "3", 10);
        let errorReason = `http_${res.status}`;
        if (parseError) errorReason = "json_parse_error";
        else if (!productId) errorReason = "missing_product_id";
        
        // Check for specific WooCommerce errors
        if (responseData?.code === "product_invalid_sku") {
             errorReason = "invalid_sku";
        }

        let errMsg = `create failed status=${res.status} ct=${ct}`;
        if (parseError) errMsg += " (JSON Parse Error)";
        else if (!productId && res.ok) errMsg += " (No Product ID in response)";
        if (errorReason === "invalid_sku") errMsg += " (Invalid/Duplicate SKU)";

        if (readCt > maxRetries || errorReason === "invalid_sku") {
          // If it's an invalid SKU error, we should probably stop retrying immediately because it won't fix itself
          const isFatal = errorReason === "invalid_sku" || readCt > maxRetries;
          
          await recordResult(userId, "wordpress", requestId, built.slug || built.sku || link, name, productId, "error", txt);
          await appendLog(userId, requestId, "error", `${errMsg} (fatal error or max retries) msg=${msg.msg_id}`);
          await pgmqArchive(queue, msg.msg_id);
          
          // Fatal error: purge remaining messages for this request
          const purged = await pgmqPurgeRequest(requestId).catch(()=>0);
          if (purged > 0) {
            await appendLog(userId, requestId, "info", `purged ${purged} remaining messages for request ${requestId}`);
          }
          await appendLog(userId, requestId, "info", "任务已停止（异常结束）");
          
          await appendLog(userId, requestId, "info", `[WARN] Item failed: ${built.slug || link}`);
          return { ok: false, reason: errorReason };
        } else {
          await appendLog(userId, requestId, "info", `Retrying msg=${msg.msg_id} (${readCt}/${maxRetries}) ${errMsg}`);
          await pgmqSetVt(queue, msg.msg_id, 60);
          return { ok: false, reason: errorReason };
        }
      }
  } catch (e: unknown) {
    const msgText = e instanceof Error ? e.message : String(e || "unknown_error");
    await appendLog(userId, requestId, "error", `runner exception: ${msgText}`);
    
    // Retry logic
    const readCt = msg.read_ct || 1;
    const maxRetries = parseInt(process.env.IMAGE_UPLOAD_RETRY || "3", 10);
    
    if (readCt > maxRetries) {
      await appendLog(userId, requestId, "error", `Max retries (${maxRetries}) reached. Giving up on ${link}`);
      await recordResult(userId, "wordpress", requestId, link, undefined, undefined, "error", `Max retries reached: ${msgText}`);
      await pgmqArchive(queue, msg.msg_id);
      await appendLog(userId, requestId, "info", `[WARN] Item failed after ${maxRetries} retries: ${link}`);
      return { ok: false, reason: "max_retries_exceeded" };
    } else {
      await appendLog(userId, requestId, "info", `Retrying msg=${msg.msg_id} (${readCt}/${maxRetries})`);
      await pgmqSetVt(queue, msg.msg_id, 60);
      return { ok: false, reason: "exception" };
    }
  }
}

async function processOne(queue: string, msg: { msg_id: number; message: unknown; read_ct?: number }) {
  // Dispatch based on queue name
  if (queue.includes("shopify")) {
    const payload = msg.message as ShopifyJobMessage;
    const userId = payload.userId;
    if (!userId) {
      await pgmqDelete(queue, msg.msg_id);
      return { ok: false, reason: "no_user_id" };
    }
    const cfg = await getWooConfigForUser(userId);
    if (!cfg) {
      // If config missing, maybe retry later or fail? 
      // For now, archive to avoid infinite loop
      await pgmqArchive(queue, msg.msg_id);
      return { ok: false, reason: "no_config" };
    }
    if (await isRequestCanceled(userId, payload.requestId || "")) {
      await appendLog(userId, payload.requestId || "", "info", `request canceled, dropping msg=${msg.msg_id}`);
      await pgmqDelete(queue, msg.msg_id);
      await pgmqPurgeRequest(payload.requestId || "").catch(()=>{});
      return { ok: false, reason: "canceled" };
    }
    if (await isRequestStopped(userId, payload.requestId || "")) {
       await appendLog(userId, payload.requestId || "", "info", `request previously stopped, dropping stale msg=${msg.msg_id}`);
       await pgmqDelete(queue, msg.msg_id);
       return { ok: false, reason: "stale_stopped" }; 
    }
    const res = await processShopifyJob(payload, cfg);
    if (res.ok) {
      try {
        await pgmqDelete(queue, msg.msg_id);
      } catch (e) {
        console.error(`[WARN] Shopify job success but failed to delete msg=${msg.msg_id}: ${e}`);
      }
    } else {
      const readCt = msg.read_ct || 1;
      const maxRetries = parseInt(process.env.IMAGE_UPLOAD_RETRY || "3", 10);
      if (readCt > maxRetries) {
        await appendLog(userId, payload.requestId || "", "error", `Max retries (${maxRetries}) reached for Shopify job: ${payload.handle}`);
        await recordResult(userId, "shopify", payload.requestId || "", payload.handle || "unknown", undefined, undefined, "error", "Max retries reached");
        await pgmqArchive(queue, msg.msg_id);
        await appendLog(userId, payload.requestId || "", "info", `[WARN] Item failed after ${maxRetries} retries: ${payload.handle}`);
      } else {
        await appendLog(userId, payload.requestId || "", "info", `Retrying Shopify job: ${payload.handle}... (${readCt}/${maxRetries})`);
        await pgmqSetVt(queue, msg.msg_id, 60);
      }
    }
    return res;
  }

  if (queue.includes("wix")) {
    const payload = msg.message as WixJobMessage;
    const userId = payload.userId;
    if (!userId) {
      await pgmqDelete(queue, msg.msg_id);
      return { ok: false, reason: "no_user_id" };
    }
    const cfg = await getWooConfigForUser(userId);
    if (!cfg) {
      await pgmqArchive(queue, msg.msg_id);
      return { ok: false, reason: "no_config" };
    }
    if (await isRequestCanceled(userId, payload.requestId || "")) {
      await appendLog(userId, payload.requestId || "", "info", `request canceled, dropping msg=${msg.msg_id}`);
      await pgmqDelete(queue, msg.msg_id);
      await pgmqPurgeRequest(payload.requestId || "").catch(()=>{});
      return { ok: false, reason: "canceled" };
    }
    if (await isRequestStopped(userId, payload.requestId || "")) {
       await appendLog(userId, payload.requestId || "", "info", `request previously stopped, dropping stale msg=${msg.msg_id}`);
       await pgmqDelete(queue, msg.msg_id);
       return { ok: false, reason: "stale_stopped" }; 
    }
    const res = await processWixJob(payload);
    if (res.ok) {
      try {
        await pgmqDelete(queue, msg.msg_id);
      } catch (e) {
        console.error(`[WARN] Wix job success but failed to delete msg=${msg.msg_id}: ${e}`);
      }
    } else {
      const readCt = msg.read_ct || 1;
      const maxRetries = parseInt(process.env.IMAGE_UPLOAD_RETRY || "3", 10);
      if (readCt > maxRetries) {
        await appendLog(userId, payload.requestId || "", "error", `Max retries (${maxRetries}) reached for Wix job: ${payload.link}`);
        await recordResult(userId, "wix", payload.requestId || "", payload.link || "unknown", undefined, undefined, "error", "Max retries reached");
        await pgmqArchive(queue, msg.msg_id);
        await appendLog(userId, payload.requestId || "", "info", `[WARN] Item failed after ${maxRetries} retries: ${payload.link}`);
      } else {
        await appendLog(userId, payload.requestId || "", "info", `Retrying Wix job: ${payload.link}... (${readCt}/${maxRetries})`);
        await pgmqSetVt(queue, msg.msg_id, 60);
      }
    }
    return res;
  }

  // Default to WordPress
  return processWordpressJob(queue, msg);
}

export async function GET(req: Request) {
  if (!(await auth(req))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const queues = [
      pgmqQueueName("wordpress_high"),
      pgmqQueueName("wordpress"),
      pgmqQueueName("shopify_high"),
      pgmqQueueName("shopify"),
      pgmqQueueName("wix_high"),
      pgmqQueueName("wix")
    ];
    
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ ok: false, error: "no_supabase" }, { status: 200 });
    const out: Record<string, unknown>[] = [];
    const budgetMs = parseInt(process.env.RUNNER_BUDGET_MS || "90000", 10) || 90000;
    const t0 = Date.now();
    
    for (const q of queues) {
      if (Date.now() - t0 > budgetMs) break;

      const msRpc = parseInt(process.env.SUPABASE_TIMEOUT_MS || "5000", 10) || 5000;
      const msProc = parseInt(process.env.RUNNER_PROCESS_TIMEOUT_MS || "60000", 10) || 60000;
      // Increase visibility timeout to 60s to allow for parallel processing overhead
      const messages = await withTimeout(pgmqRead(q, 60, 10), msRpc).catch(() => [] as { msg_id: number; message: unknown; read_ct?: number }[]);
      
      // Process messages concurrently
      const promises = messages.map(async (m) => {
        try {
          const r = await withTimeout(
            processOne(q, { msg_id: m.msg_id, message: m.message, read_ct: m.read_ct }),
            msProc
          );
          return { queue: q, msg_id: m.msg_id, result: r };
        } catch (e: unknown) {
          // If processing times out or fails unexpectedly, ensure we don't lose the message
          // by NOT deleting it. It will become visible again after VT expires.
          // But we should log this.
          const msgPayload = m.message as { userId?: string; requestId?: string };
          const uid = msgPayload?.userId || "";
          const rid = msgPayload?.requestId || "";
          if (uid && rid) {
             // Log error but don't be too noisy if it's just a timeout that will retry
             const errMsg = e instanceof Error ? e.message : (typeof e === 'object' ? JSON.stringify(e) : String(e));
             // If timeout, maybe we should extend VT? For now just log.
             await appendLog(uid, rid, "error", `processOne exception/timeout: ${errMsg}`);
             // If we timeout, we should explicitly extend VT so it doesn't become visible immediately if the processing is actually still running in background
             // But here we assume it failed.
             // Let's extend VT by another 60s to give it breathing room before retry
             await pgmqSetVt(q, m.msg_id, 60).catch((vtErr)=>{
                console.error(`Failed to set VT on timeout cleanup: ${vtErr}`);
             });
          }
          // IMPORTANT: Do NOT delete message here. It will be retried after VT (60s).
          return {
            queue: q,
            msg_id: m.msg_id,
            result: {
              ok: false,
              reason: e instanceof Error ? e.message : String(e || "timeout"),
            },
          };
        }
      });

      const results = await Promise.all(promises);
      out.push(...results);
    }
    return NextResponse.json({ ok: true, processed: out.length, details: out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e || "unknown_error");
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}

export async function POST(req: Request) { return GET(req); }
