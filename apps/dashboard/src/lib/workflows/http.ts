import { assertPublicHttpsUrl } from "@opendoor/shared";

export type WorkflowHttpResult = {
  ok: boolean;
  status: number;
  text: string;
  error?: string;
};

const TIMEOUT_MS = 10_000;
const MAX_BODY = 8_000;

export async function runWorkflowHttp(opts: {
  method?: string;
  url: string;
  headers?: unknown;
  body?: string;
  fetchImpl?: typeof fetch;
}): Promise<WorkflowHttpResult> {
  const checked = assertPublicHttpsUrl(opts.url);
  if (!checked.ok) {
    return { ok: false, status: 0, text: "", error: checked.error };
  }

  const method = (opts.method || "POST").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { ok: false, status: 0, text: "", error: "HTTP method must be GET, POST, PUT, PATCH, or DELETE." };
  }

  const headers: Record<string, string> = { accept: "application/json, text/plain;q=0.9,*/*;q=0.8" };
  if (opts.headers && typeof opts.headers === "object" && !Array.isArray(opts.headers)) {
    for (const [key, value] of Object.entries(opts.headers as Record<string, unknown>)) {
      if (!key.trim() || typeof value !== "string") continue;
      if (key.toLowerCase() === "host" || key.toLowerCase() === "authorization" && value.length > 8_000) continue;
      headers[key] = value;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const fetchImpl = opts.fetchImpl || fetch;
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (method !== "GET" && method !== "DELETE" && opts.body) {
      init.body = opts.body;
      if (!headers["content-type"] && !headers["Content-Type"]) {
        headers["content-type"] = "application/json";
      }
    }
    const res = await fetchImpl(checked.url.toString(), init);
    const text = (await res.text()).slice(0, MAX_BODY);
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : "HTTP request failed";
    return { ok: false, status: 0, text: "", error: message };
  } finally {
    clearTimeout(timer);
  }
}
