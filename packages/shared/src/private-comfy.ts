/** Gated leftover. Only used when PRIVATE_IMAGE_GEN_KIND=comfy (off by default, not in the UI). */
import { privateImageAuthHeaders } from "./gcp-id-token.js";

export const PRIVATE_GPU_OFFLINE = "Studio GPU offline";
export const COMFY_NO_CHECKPOINT =
  "Private image checkpoint is not loaded. Set PRIVATE_IMAGE_GEN_CHECKPOINT.";

export function env(name: string): string {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[name] || "";
}

export function bytesToB64(buf: ArrayBuffer | Uint8Array): string {
  const g = globalThis as { Buffer?: { from(b: ArrayBuffer | Uint8Array): { toString(enc: string): string } } };
  if (g.Buffer) return g.Buffer.from(buf).toString("base64");
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  const g = globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } };
  if (g.Buffer) return new Uint8Array(g.Buffer.from(clean, "base64"));
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function newClientId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `opendoor-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function parseSize(size?: string): { width: number; height: number } {
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(size || "");
  const width = Math.max(64, Math.round((m ? Number(m[1]) : 1024) / 8) * 8);
  const height = Math.max(64, Math.round((m ? Number(m[2]) : 1024) / 8) * 8);
  return { width, height };
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.75;
  return Math.min(1, Math.max(0, n));
}

export function isConnectFail(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    m.includes("fetch failed") ||
    m.includes("econnrefused") ||
    m.includes("enotfound") ||
    m.includes("econnreset") ||
    m.includes("network") ||
    m.includes("aborted")
  );
}

export async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const extra = await privateImageAuthHeaders(url);
  if (!Object.keys(extra).length) return fetch(url, init);
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return fetch(url, { ...init, headers });
}

export async function fetchOk(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await authedFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export class PrivateImageDownError extends Error {
  status = 503;
  allowFallback: boolean;
  constructor(message: string, allowFallback = true) {
    super(message);
    this.name = "PrivateImageDownError";
    this.allowFallback = allowFallback;
  }
}

export function isPrivateImageDown(err: unknown): err is PrivateImageDownError {
  return err instanceof PrivateImageDownError;
}

export function offlineError(): PrivateImageDownError {
  return new PrivateImageDownError(PRIVATE_GPU_OFFLINE);
}

export type DecodedMedia = {
  bytes: Uint8Array;
  mime: string;
  filename: string;
};

function filenameFromMime(mime: string, fallback: string): string {
  const ext =
    mime.includes("png") ? "png"
    : mime.includes("jpeg") || mime.includes("jpg") ? "jpg"
    : mime.includes("webp") ? "webp"
    : mime.includes("gif") ? "gif"
    : mime.includes("mp4") ? "mp4"
    : mime.includes("webm") ? "webm"
    : mime.includes("quicktime") ? "mov"
    : fallback.includes(".") ? fallback.split(".").pop() || "bin"
    : "bin";
  const base = fallback.replace(/\.[^.]+$/, "") || "input";
  return `${base}.${ext}`;
}

export function decodeMediaString(raw: string, fallbackName = "input.png"): DecodedMedia | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const data = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed);
  if (data) {
    const mime = data[1] || "application/octet-stream";
    return { bytes: b64ToBytes(data[2] || ""), mime, filename: filenameFromMime(mime, fallbackName) };
  }
  if (trimmed.length > 64 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    return {
      bytes: b64ToBytes(trimmed.replace(/\s/g, "")),
      mime: fallbackName.endsWith(".mp4") ? "video/mp4" : "image/png",
      filename: fallbackName,
    };
  }
  return null;
}

export function sanitizeUploadName(name: string, fallback: string): string {
  const base = (name || fallback).split(/[/\\]/).pop() || fallback;
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 180) || fallback;
}

export type ComfyMediaRef = {
  filename: string;
  subfolder?: string;
  type?: string;
};

export type ComfyHistoryEntry = {
  outputs?: Record<
    string,
    {
      images?: ComfyMediaRef[];
      gifs?: ComfyMediaRef[];
      videos?: ComfyMediaRef[];
    }
  >;
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
};

export function historyError(entry: ComfyHistoryEntry | undefined): string | null {
  if (!entry?.status) return null;
  if (entry.status.status_str === "error") {
    const messages = Array.isArray(entry.status.messages) ? entry.status.messages : [];
    const text = JSON.stringify(messages).slice(0, 800);
    return text && text !== "[]" ? `ComfyUI execution error: ${text}` : "ComfyUI execution error";
  }
  return null;
}

export function historyMedia(entry: ComfyHistoryEntry | undefined): {
  images: ComfyMediaRef[];
  videos: ComfyMediaRef[];
} {
  const images: ComfyMediaRef[] = [];
  const videos: ComfyMediaRef[] = [];
  if (!entry?.outputs) return { images, videos };
  for (const o of Object.values(entry.outputs)) {
    for (const img of o.images || []) images.push(img);
    for (const g of o.gifs || []) videos.push(g);
    for (const v of o.videos || []) videos.push(v);
  }
  return { images, videos };
}

export async function fetchComfyObjectInfo(base: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await authedFetch(`${base}/object_info`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function uploadComfyInput(
  base: string,
  media: DecodedMedia,
  kind: "image" | "video" = "image"
): Promise<{ name: string; subfolder: string; type: string }> {
  const filename = sanitizeUploadName(media.filename, kind === "video" ? "input.mp4" : "input.png");
  const copy = new Uint8Array(media.bytes.byteLength);
  copy.set(media.bytes);
  const blob = new Blob([copy], { type: media.mime || "application/octet-stream" });
  const paths = kind === "video" ? ["/upload/image", "/upload/video"] : ["/upload/image"];
  let lastErr = "ComfyUI upload failed";
  for (const path of paths) {
    const form = new FormData();
    form.append("image", blob, filename);
    form.append("overwrite", "true");
    form.append("type", "input");
    let res: Response;
    try {
      res = await authedFetch(`${base}${path}`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      if (isConnectFail(err)) throw offlineError();
      lastErr = err instanceof Error ? err.message : lastErr;
      continue;
    }
    if (res.status === 404) continue;
    if (!res.ok) {
      lastErr = `ComfyUI upload error: ${(await res.text()).slice(0, 400)}`;
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as {
      name?: string;
      filename?: string;
      subfolder?: string;
      type?: string;
    };
    const name = data.name || data.filename || filename;
    return { name, subfolder: data.subfolder || "", type: data.type || "input" };
  }
  throw new Error(lastErr);
}

export async function viewComfyFile(
  base: string,
  ref: ComfyMediaRef
): Promise<{ b64: string; mime: string }> {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder || "",
    type: ref.type || "output",
  });
  let view: Response;
  try {
    view = await authedFetch(`${base}/view?${params}`, { signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    if (isConnectFail(err)) throw offlineError();
    throw err;
  }
  if (!view.ok) throw new Error("ComfyUI view failed");
  const mime = view.headers.get("content-type") || guessMime(ref.filename);
  return { b64: bytesToB64(await view.arrayBuffer()), mime };
}

function guessMime(filename: string): string {
  const n = filename.toLowerCase();
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

export type ComfyRunResult = {
  promptId: string;
  images: ComfyMediaRef[];
  videos: ComfyMediaRef[];
};

export async function runComfyPrompt(
  base: string,
  workflow: unknown,
  opts?: { timeoutMs?: number; waitFor?: "image" | "video" | "any" }
): Promise<ComfyRunResult> {
  const waitFor = opts?.waitFor || "image";
  const timeoutMs = opts?.timeoutMs ?? 300_000;
  const clientId = newClientId();

  let queued: Response;
  try {
    queued = await authedFetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (isConnectFail(err)) throw offlineError();
    throw err;
  }

  const raw = await queued.text();
  let q: {
    prompt_id?: string;
    node_errors?: Record<string, unknown>;
    error?: { message?: string; type?: string };
  } = {};
  try {
    q = raw ? (JSON.parse(raw) as typeof q) : {};
  } catch {
    throw new Error(`ComfyUI queue error: ${raw.slice(0, 800)}`);
  }

  const nodeErrors = q.node_errors && Object.keys(q.node_errors).length > 0 ? q.node_errors : null;
  if (!queued.ok || nodeErrors || q.error) {
    const detail = JSON.stringify(nodeErrors || q.error || raw).slice(0, 800);
    if (/ckpt|checkpoint/i.test(detail)) {
      throw new PrivateImageDownError(COMFY_NO_CHECKPOINT, false);
    }
    throw new Error(`ComfyUI queue error: ${detail}`);
  }
  if (!q.prompt_id) throw new Error("ComfyUI did not return prompt_id");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    let hist: Response;
    try {
      hist = await authedFetch(`${base}/history/${q.prompt_id}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      if (isConnectFail(err)) throw offlineError();
      continue;
    }
    if (!hist.ok) continue;
    const body = (await hist.json()) as Record<string, ComfyHistoryEntry> & ComfyHistoryEntry;
    const entry = body[q.prompt_id] || (body.outputs ? body : undefined);
    const execErr = historyError(entry);
    if (execErr) throw new Error(execErr);
    const media = historyMedia(entry);
    const ready =
      waitFor === "video" ? media.videos.length > 0
      : waitFor === "any" ? media.images.length + media.videos.length > 0
      : media.images.length > 0;
    if (!ready) {
      if (entry?.status?.completed) {
        throw new Error(
          waitFor === "video"
            ? "ComfyUI finished without a video"
            : "ComfyUI finished without an image"
        );
      }
      continue;
    }
    return { promptId: q.prompt_id, images: media.images, videos: media.videos };
  }
  throw new Error(
    waitFor === "video"
      ? "ComfyUI timed out waiting for the video"
      : "ComfyUI timed out waiting for the image"
  );
}

export type ComfyNodeInfo = {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
  };
};

export function nodeInfo(objectInfo: Record<string, unknown>, classType: string): ComfyNodeInfo | null {
  const row = objectInfo[classType];
  if (!row || typeof row !== "object") return null;
  return row as ComfyNodeInfo;
}

function isLinkType(typeName: string): boolean {
  return [
    "MODEL",
    "CLIP",
    "VAE",
    "IMAGE",
    "LATENT",
    "CONDITIONING",
    "MASK",
    "AUDIO",
    "VIDEO",
    "MOTION_MODEL",
    "CONTROL_NET",
  ].includes(typeName);
}

function specType(spec: unknown): string | null {
  if (typeof spec === "string") return spec;
  if (Array.isArray(spec) && typeof spec[0] === "string") return spec[0];
  return null;
}

function specChoices(spec: unknown): string[] | null {
  if (!Array.isArray(spec)) return null;
  if (Array.isArray(spec[0])) {
    return (spec[0] as unknown[]).filter((n): n is string => typeof n === "string");
  }
  return null;
}

function specDefault(spec: unknown): unknown {
  if (!Array.isArray(spec)) return undefined;
  const opts = spec[1] && typeof spec[1] === "object" ? (spec[1] as Record<string, unknown>) : {};
  if ("default" in opts) return opts.default;
  const choices = specChoices(spec);
  if (choices?.[0] !== undefined) return choices[0];
  const t = specType(spec);
  if (t === "INT" || t === "FLOAT") return 0;
  if (t === "STRING") return "";
  if (t === "BOOLEAN") return false;
  return undefined;
}

export function fillNodeWidgets(
  objectInfo: Record<string, unknown>,
  classType: string,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const info = nodeInfo(objectInfo, classType);
  const inputs: Record<string, unknown> = {};
  const groups = [info?.input?.required, info?.input?.optional];
  for (const group of groups) {
    if (!group) continue;
    for (const [key, spec] of Object.entries(group)) {
      if (key in overrides) {
        const value = overrides[key];
        const choices = specChoices(spec);
        if (choices && typeof value === "string" && !choices.includes(value)) {
          const prefer = choices.find((c) => c === value) || choices[0];
          if (prefer !== undefined) inputs[key] = prefer;
        } else {
          inputs[key] = value;
        }
        continue;
      }
      const t = specType(spec);
      if (t && isLinkType(t) && !specChoices(spec)) continue;
      const fallback = specDefault(spec);
      if (fallback !== undefined) inputs[key] = fallback;
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in inputs)) inputs[key] = value;
  }
  return inputs;
}

export function pickCombo(
  objectInfo: Record<string, unknown>,
  classType: string,
  field: string,
  prefer: string[]
): string | undefined {
  const spec =
    nodeInfo(objectInfo, classType)?.input?.required?.[field] ||
    nodeInfo(objectInfo, classType)?.input?.optional?.[field];
  const choices = specChoices(spec) || [];
  for (const p of prefer) {
    const hit = choices.find((c) => c === p || c.toLowerCase().includes(p.toLowerCase()));
    if (hit) return hit;
  }
  return choices[0];
}
