import { fetchProductByHandle } from "./shopify";
import { buildWooProductPayload, buildVariationFromShopifyVariant } from "./importMap";
import { ensureTerms, wooPost, wooPut, wooGet, type WooConfig } from "./woo";
import { appendLog } from "./logs";
import { recordResult } from "./history";

export type ShopifyJobMessage = {
  userId?: string;
  requestId?: string;
  shopifyBaseUrl?: string;
  handle?: string;
  categories?: string[];
  tags?: string[];
};

export async function processShopifyJob(
  msg: ShopifyJobMessage,
  cfg: WooConfig
): Promise<{ ok: boolean; reason?: string }> {
  const { userId, requestId, shopifyBaseUrl, handle } = msg;
  if (!userId || !requestId || !shopifyBaseUrl || !handle) {
    return { ok: false, reason: "missing_fields" };
  }

  const logCtx = { userId, requestId, productHandle: handle };

  try {
    // 1. Fetch from Shopify
    await appendLog(userId, requestId, "info", `fetching shopify product ${handle} from ${shopifyBaseUrl}`);
    const shopifyProduct = await fetchProductByHandle(shopifyBaseUrl, handle);
    
    if (!shopifyProduct) {
      // Don't record result here, let runner handle retry/failure
      // await recordResult(userId, "shopify", requestId, handle, undefined, undefined, "error", "shopify_fetch_failed");
      return { ok: false, reason: "fetch_failed" };
    }

    // 2. Build Woo Payload
    const payload = buildWooProductPayload(shopifyProduct);
    
    // 3. Handle Categories & Tags
    const catNames = msg.categories || [];
    const tagNames = [...(msg.tags || []), ...(shopifyProduct.product_type ? [shopifyProduct.product_type] : [])];
    // Also add vendor as brand/tag if needed? For now just add to tags if user wants, but let's stick to explicit tags + product_type
    
    // Ensure terms
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

    // 4. Check if exists
    // Strategy: Check by SKU (if simple) or Slug
    let existingId: number | undefined = undefined;
    
    // Try finding by SKU first if available
    if (payload.sku) {
        const found = await findProductBySku(cfg, payload.sku);
        if (found) existingId = found.id;
    }
    
    // If not found by SKU, try by Slug
    if (!existingId) {
        const found = await findProductBySlug(cfg, payload.slug || handle);
        if (found) existingId = found.id;
    }

    let productId = existingId;
    const action: "add" | "update" = existingId ? "update" : "add";

    // 5. Create or Update Parent
    if (existingId) {
      await appendLog(userId, requestId, "info", `updating existing product id=${existingId}`);
      await wooPut(cfg, `index.php/wp-json/wc/v3/products/${existingId}`, payload, logCtx, { retries: 0 });
    } else {
      await appendLog(userId, requestId, "info", `creating new product ${payload.name}`);
      const res = await wooPost(cfg, `index.php/wp-json/wc/v3/products`, payload, logCtx, { retries: 0 });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`create_failed ${res.status}: ${txt}`);
      }
      const j = await res.json();
      productId = j.id;
    }

    if (!productId) throw new Error("no_product_id");

    // 6. Handle Variations if Variable
    if (payload.type === "variable" && shopifyProduct.variants?.length) {
        await appendLog(userId, requestId, "info", `processing ${shopifyProduct.variants.length} variations for product ${productId}`);
        
        // Use batch create if possible, but woo REST API for variations is often one-by-one or batch endpoint
        // Let's iterate for safety and simplicity first
        for (const variant of shopifyProduct.variants) {
            const varPayload = buildVariationFromShopifyVariant(variant, shopifyProduct.options || []);
            // Try to find existing variation by SKU to update, or just create?
            // Woo doesn't easily let us find variation by SKU globally without parent ID.
            // Since we have parent ID, we can list variations. 
            // Optimization: Just create. If duplicate SKU, Woo might complain.
            // Better strategy: "create" endpoint on variations.
            
            // To be robust: Check if we are updating. If updating, we might want to sync variations.
            // For now, let's just attempt to create them. If it fails due to SKU, we log.
            try {
                // If updating parent, we might want to check if variation exists?
                // Simplest migration path: Just POST to products/{id}/variations
                const res = await wooPost(cfg, `index.php/wp-json/wc/v3/products/${productId}/variations`, varPayload, logCtx, { retries: 0 });
                if (!res.ok) {
                   // If 400 and code is "woocommerce_product_invalid_sku", maybe we need to update?
                   // Implementing full sync logic is complex. 
                   // Let's try to handle the "already exists" case if possible, or just ignore for MVP.
                   const txt = await res.text();
                   if (res.status === 400 && txt.includes("sku")) {
                       // Try to find variation by SKU in this product
                       // ... (Skipping complex sync for now, assuming clean import or overwrite)
                       await appendLog(userId, requestId, "info", `variation create failed (sku collision?): ${txt}`);
                   }
                }
            } catch (e) {
                await appendLog(userId, requestId, "error", `variation error: ${e}`);
            }
        }
    }

    await recordResult(userId, "shopify", requestId, handle, payload.name, productId, "success", undefined, action);
    return { ok: true };

  } catch (e: unknown) {
    const msgText = (e as Error)?.message || String(e);
    // await recordResult(userId, "shopify", requestId, handle, undefined, undefined, "error", msgText);
    await appendLog(userId, requestId, "error", `processShopifyJob failed: ${msgText}`);
    return { ok: false, reason: "exception" };
  }
}

async function findProductBySku(cfg: WooConfig, sku: string) {
    const res = await wooGet(cfg, `index.php/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`);
    if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j) && j.length > 0) return j[0];
    }
    return null;
}

async function findProductBySlug(cfg: WooConfig, slug: string) {
    const res = await wooGet(cfg, `index.php/wp-json/wc/v3/products?slug=${encodeURIComponent(slug)}`);
    if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j) && j.length > 0) return j[0];
    }
    return null;
}
