
import { getSupabaseServer } from "./supabaseServer";
import { createHash } from "crypto";

const BUCKET_NAME = "import_images";

function getHash(str: string) {
  return createHash("sha256").update(str).digest("hex");
}

function getExtensionFromContentType(contentType: string) {
  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("image/webp")) return ".webp";
  if (contentType.includes("image/gif")) return ".gif";
  if (contentType.includes("image/avif")) return ".avif";
  if (contentType.includes("image/bmp")) return ".bmp";
  if (contentType.includes("image/tiff")) return ".tiff";
  return "";
}

/**
 * Uploads an image to Supabase Storage.
 * Path structure: userId/requestId/hash.ext (if requestId provided) or userId/hash.ext
 */
export async function uploadImageToSupabase(url: string, userId: string, requestId?: string): Promise<string | null> {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return null;

    // 1. Fetch the image
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error(`Failed to fetch image ${url}: ${res.status} ${res.statusText}`);
      return null;
    }

    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const contentType = res.headers.get("content-type") || blob.type;

    // 2. Determine filename
    let ext = getExtensionFromContentType(contentType);
    if (!ext) {
      const u = new URL(url);
      const path = u.pathname;
      if (/\.(jpe?g|png|webp|gif|avif|bmp|tiff)$/i.test(path)) {
        const match = path.match(/\.(jpe?g|png|webp|gif|avif|bmp|tiff)$/i);
        if (match) ext = match[0].toLowerCase();
      }
    }
    if (!ext) ext = ".jpg"; 

    const hash = getHash(url);
    // Structure: userId/requestId/hash.ext or userId/hash.ext
    let path = `${userId}/${hash}${ext}`;
    if (requestId) {
        path = `${userId}/${requestId}/${hash}${ext}`;
    }

    // 3. Upload to Supabase
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, buffer, {
        contentType: contentType,
        upsert: true
      });

    if (uploadError) {
        console.error(`Supabase upload error for ${url}:`, uploadError);
        return null;
    }

    // 4. Get Public URL
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;

  } catch (e) {
    console.error(`Exception uploading image ${url}:`, e);
    return null;
  }
}

/**
 * Deletes all images for a specific request.
 * Assumes images are stored under userId/requestId/ folder.
 */
export async function deleteRequestImages(userId: string, requestId: string) {
    try {
        const supabase = getSupabaseServer();
        if (!supabase) return;

        const folder = `${userId}/${requestId}`;
        // List files in the folder
        const { data: files, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list(folder);

        if (error || !files || files.length === 0) return;

        const paths = files.map(f => `${folder}/${f.name}`);
        await supabase.storage
            .from(BUCKET_NAME)
            .remove(paths);
            
    } catch (e) {
        console.error(`Failed to cleanup images for ${userId}/${requestId}:`, e);
    }
}
