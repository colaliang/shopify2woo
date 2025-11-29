import { appendLog } from "@/lib/logs";

export interface WixJobMessage {
  userId?: string;
  requestId?: string;
  source?: "wix";
  link?: string;
  // Add other Wix-specific fields as needed
}

export async function processWixJob(
  msg: WixJobMessage
): Promise<{ ok: boolean; reason?: string }> {
  const { userId, requestId, link } = msg;

  if (!userId || !requestId || !link) {
    return { ok: false, reason: "missing_fields" };
  }

  // TODO: Implement Wix scraping and import logic
  await appendLog(userId, requestId, "info", `Wix runner not implemented yet. Link: ${link}`);

  return { ok: false, reason: "not_implemented" };
}
