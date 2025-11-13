export function logInfo(event: string, data: Record<string, unknown> = {}) {
  try {
    const out = { ts: new Date().toISOString(), level: "INFO", event, ...data };
    console.log(JSON.stringify(out));
  } catch {}
}

export function logError(event: string, data: Record<string, unknown> = {}) {
  try {
    const out = { ts: new Date().toISOString(), level: "ERROR", event, ...data };
    console.error(JSON.stringify(out));
  } catch {}
}

