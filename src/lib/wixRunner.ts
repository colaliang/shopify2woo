import { appendLog } from "@/lib/logs";
import { recordResult } from "@/lib/history";
import { ensureTerms, wooPost, wooPut, wooGet, type WooConfig } from "@/lib/woo";
import { fetchHtmlMeta } from "@/lib/wordpressScrape";
import { buildWixPayload, buildWixVariationsFromHtml } from "@/lib/wixScrape";
import { getImportCache, saveImportCache, isCacheValid, sha256 } from "@/lib/cache";
import { getSupabaseServer } from "@/lib/supabaseServer";

export interface WixJobMessage {
  userId?: string;
  requestId?: string;
  source?: "wix";
  link?: string;
  categories?: string[];
  tags?: string[];
}

async function findProductBySku(cfg: WooConfig, sku: string) {
    const res = await wooGet(cfg, `wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`);
    if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j) && j.length > 0) return j[0];
    }
    return null;
}

async function findProductBySlug(cfg: WooConfig, slug: string) {
    const res = await wooGet(cfg, `wp-json/wc/v3/products?slug=${encodeURIComponent(slug)}`);
    if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j) && j.length > 0) return j[0];
    }
    return null;
}

export async function processWixJob(
  msg: WixJobMessage,
  cfg: WooConfig
): Promise<{ ok: boolean; reason?: string }> {
  const { userId, requestId, link } = msg;

  if (!userId || !requestId || !link) {
    return { ok: false, reason: "missing_fields" };
  }

  const logCtx = { userId, requestId, productHandle: link };

  try {
    // Deduplicate: check if this item already has a final result (success)
    // This mimics the WordPress runner logic, but without deleting the message (handled by caller)
    try {
      const supabase = getSupabaseServer();
      if (supabase) {
        const { data: existing } = await supabase
          .from("import_results")
          .select("status")
          .eq("request_id", requestId)
          .eq("item_key", link)
          .limit(1)
          .maybeSingle();
        if (existing && existing.status === "success") {
           await appendLog(userId, requestId, "info", `skipping duplicate item (already success): ${link}`);
           return { ok: true };
        }
      }
    } catch {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let built: any = null;
    let html = "";
    let finalUrl = link;

    // 1. Try Cache
    try {
       const c = await getImportCache(link);
       if (c && isCacheValid(c) && c.result_json) {
          await appendLog(userId, requestId, "info", `using cached scrape for ${link}`);
          built = c.result_json;
       }
    } catch {}

    if (!built) {
        await appendLog(userId, requestId, "info", `fetching wix product from ${link}`);
        try {
          const meta = await fetchHtmlMeta(link);
          html = meta.html;
          finalUrl = meta.finalUrl;
          
          const baseBuilt = buildWixPayload(finalUrl, html);
          // Also build variations and attach to "built" so we can cache it
          const vars = buildWixVariationsFromHtml(html);
          
          // Combine
          built = { ...baseBuilt, _variations: vars };
          
          try {
             await saveImportCache(link, sha256(html), built);
          } catch {}
        } catch (e) {
          await appendLog(userId, requestId, "error", `wix fetch failed: ${e}`);
          return { ok: false, reason: "fetch_failed" };
        }
    }

    if (!built) {
        return { ok: false, reason: "build_failed" };
    }

    // 2. Prepare Data
    const payload = built.payload;
    const extractedCats = built.categories || [];
    const extractedTags = built.tags || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variationsData = built._variations; 

    // 3. Handle Categories & Tags
    const catNames = Array.from(new Set([...(msg.categories || []), ...extractedCats]));
    const tagNames = Array.from(new Set([...(msg.tags || []), ...extractedTags]));

    try {
      if (catNames.length) {
        const terms = await ensureTerms(cfg, "category", catNames, logCtx);
        if (terms.length) payload.categories = terms.map(t => ({ id: t.id }));
      }
      if (tagNames.length) {
        const terms = await ensureTerms(cfg, "tag", tagNames, logCtx);
        if (terms.length) payload.tags = terms.map(t => ({ id: t.id }));
      }
    } catch (e) {
      await appendLog(userId, requestId, "error", `term ensure failed: ${e}`);
    }

    // 4. Create/Update Parent Product
    let productId: number | undefined;
    let name = String(payload.name || "");

    // Check if product exists by SKU (if available) or Name/Slug
    let existingId: number | undefined = undefined;
    
    if (payload.sku) {
        const found = await findProductBySku(cfg, String(payload.sku));
        if (found) existingId = found.id;
    }
    
    if (!existingId && name) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const found = await findProductBySlug(cfg, slug);
        if (found) existingId = found.id;
    }
    
    // Robust Posting Logic (similar to WP runner)
    let res: Response;
    let responseData: any = {};
    let parseError = false;

    if (existingId) {
         await appendLog(userId, requestId, "info", `updating existing wix product id=${existingId}`);
         res = await wooPut(cfg, `wp-json/wc/v3/products/${existingId}`, payload, logCtx, { retries: 0 });
         productId = existingId;
    } else {
         await appendLog(userId, requestId, "info", `creating wix product ${name}`);
         res = await wooPost(cfg, `wp-json/wc/v3/products`, payload, logCtx, { retries: 0 });
    }

    const txt = await res.text();
    try {
        responseData = JSON.parse(txt);
        if (!existingId) productId = responseData.id;
    } catch {
        parseError = true;
    }

    // Handle "invalid_sku" or "slug_already_exists" by attempting update if we didn't already
    if (!existingId && (responseData?.code === "product_invalid_sku" || responseData?.code === "product_invalid_slug")) {
        const resourceId = responseData?.data?.resource_id;
        if (resourceId) {
            await appendLog(userId, requestId, "info", `Product already exists (id=${resourceId}), attempting update...`);
            res = await wooPut(cfg, `wp-json/wc/v3/products/${resourceId}`, payload, logCtx, { retries: 0 });
            try {
                const j = await res.json();
                productId = j.id;
            } catch {}
        } else {
            // If we can't find ID, we can't update. Mark as skipped/success?
             await appendLog(userId, requestId, "info", `Product SKU/Slug exists but no ID returned. Skipping.`);
             await recordResult(userId, "wix", requestId, link, name, undefined, "success", undefined, "skipped_duplicate");
             return { ok: true };
        }
    }

    if (!productId) {
        const reason = `create_failed_${res.status}`;
        await appendLog(userId, requestId, "error", `create failed: ${res.status} ${txt}`);
        return { ok: false, reason };
    }

    // 5. Handle Variations
    // We use the variationsData we prepared (either from cache or fresh scrape)
    if (payload.type === "variable" && variationsData && variationsData.variations?.length) {
         const variations = variationsData.variations;
         await appendLog(userId, requestId, "info", `processing ${variations.length} variations for product ${productId}`);
         
         const batch = variations.map((v: any) => ({
            regular_price: v.regular_price,
            attributes: v.attributes,
            image: v.image
         }));
         
         // Split into chunks of 50
         for (let i = 0; i < batch.length; i += 50) {
            const chunk = batch.slice(i, i + 50);
            await wooPost(cfg, `index.php/wp-json/wc/v3/products/${productId}/variations/batch`, { create: chunk }, logCtx, { retries: 1 });
         }
    }

    // 6. Success
    await recordResult(userId, "wix", requestId, link, name, productId, "success", undefined, existingId ? "update" : "create");
    await appendLog(userId, requestId, "info", `wix product processed id=${productId}`);
    
    return { ok: true };

  } catch (e) {
    const msgText = e instanceof Error ? e.message : String(e);
    await appendLog(userId, requestId, "error", `wix runner exception: ${msgText}`);
    return { ok: false, reason: "exception" };
  }
}
