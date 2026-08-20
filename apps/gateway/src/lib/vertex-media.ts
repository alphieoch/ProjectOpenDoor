import { vertexPlatformConfigured, vertexProjectId } from "../providers/vertex.js";
import { getGcpAccessToken } from "./web-search.js";

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export type MediaModelKind = "imagen" | "gemini-image" | "veo";

export type MediaModelInfo = {
  id: string;
  kind: MediaModelKind;
  location: string;
  listed: boolean;
  display_name: string;
};

/**
 * Live probe 2026-08-17 on project-800192c2-3ecc-4889-8f7 (ADC).
 * Imagen 3/4 publisher `:predict` → 404 (sunset 2026-06-30 and/or Model Garden Enable).
 * Gemini image `:generateContent` on `global` → 200 with inline image bytes.
 * Veo 3.1 `:predictLongRunning` on `us-central1` → 200 + fetchPredictOperation videos[].bytesBase64Encoded.
 */
export const VERTEX_IMAGE_MODELS: MediaModelInfo[] = [
  {
    id: "gemini-2.5-flash-image",
    kind: "gemini-image",
    location: "global",
    listed: true,
    display_name: "Gemini 2.5 Flash Image",
  },
  {
    id: "gemini-3.1-flash-image",
    kind: "gemini-image",
    location: "global",
    listed: true,
    display_name: "Gemini 3.1 Flash Image",
  },
  {
    id: "gemini-3-pro-image",
    kind: "gemini-image",
    location: "global",
    listed: true,
    display_name: "Gemini 3 Pro Image",
  },
  {
    id: "imagen-4.0-generate-001",
    kind: "imagen",
    location: "us-central1",
    listed: false,
    display_name: "Imagen 4",
  },
  {
    id: "imagen-4.0-fast-generate-001",
    kind: "imagen",
    location: "us-central1",
    listed: false,
    display_name: "Imagen 4 Fast",
  },
  {
    id: "imagen-4.0-ultra-generate-001",
    kind: "imagen",
    location: "us-central1",
    listed: false,
    display_name: "Imagen 4 Ultra",
  },
  {
    id: "imagen-3.0-generate-002",
    kind: "imagen",
    location: "us-central1",
    listed: false,
    display_name: "Imagen 3",
  },
  {
    id: "imagen-3.0-capability-001",
    kind: "imagen",
    location: "us-central1",
    listed: false,
    display_name: "Imagen 3 Capability (edit)",
  },
];

export const VERTEX_VIDEO_MODELS: MediaModelInfo[] = [
  {
    id: "veo-3.1-fast-generate-001",
    kind: "veo",
    location: "us-central1",
    listed: true,
    display_name: "Veo 3.1 Fast",
  },
  {
    id: "veo-3.1-generate-001",
    kind: "veo",
    location: "us-central1",
    listed: true,
    display_name: "Veo 3.1",
  },
  {
    id: "veo-3.0-generate-001",
    kind: "veo",
    location: "us-central1",
    listed: false,
    display_name: "Veo 3",
  },
  {
    id: "veo-3.0-fast-generate-001",
    kind: "veo",
    location: "us-central1",
    listed: false,
    display_name: "Veo 3 Fast",
  },
  {
    id: "veo-2.0-generate-001",
    kind: "veo",
    location: "us-central1",
    listed: false,
    display_name: "Veo 2",
  },
];

export const IMAGEN_ENABLE_HINT =
  "Imagen publisher models returned 404 on this project (discontinued 2026-06-30 and/or Model Garden Enable). Use gemini-2.5-flash-image, or enable Imagen in Vertex Model Garden.";

export const VEO_ENABLE_HINT =
  "This Veo model returned 404. Enable it in Vertex Model Garden, or use veo-3.1-fast-generate-001 / veo-3.1-generate-001.";

export function vertexMediaConfigured(): boolean {
  return vertexPlatformConfigured();
}

export function defaultImageModel(): string {
  return env("VERTEX_IMAGE_MODEL") || env("VERTEX_IMAGEN_MODEL") || "gemini-3.1-flash-image";
}

export function defaultVideoModel(): string {
  return env("VERTEX_VEO_MODEL") || "veo-3.1-fast-generate-001";
}

export function listedImageModels(): MediaModelInfo[] {
  return VERTEX_IMAGE_MODELS.filter((m) => m.listed);
}

export function listedVideoModels(): MediaModelInfo[] {
  return VERTEX_VIDEO_MODELS.filter((m) => m.listed);
}

export function isOpenAiImageModel(model: string): boolean {
  return /^(dall-e|gpt-image)/i.test(model);
}

const IMAGE_MODEL_ALIASES: Record<string, string> = {
  "nano-banana": "gemini-3.1-flash-image",
  "nano-banana-2": "gemini-3.1-flash-image",
  "google-nano-banana": "gemini-3.1-flash-image",
  "gemini-3.1-flash-image-preview": "gemini-3.1-flash-image",
  "nano-banana-pro": "gemini-3-pro-image",
  "gemini-3-pro-image-preview": "gemini-3-pro-image",
};

export function isImagenModel(model: string): boolean {
  return /^imagen/i.test(model) || /^imagegeneration@/i.test(model);
}

export function isGeminiImageModel(model: string): boolean {
  return /gemini-.*-image/i.test(model);
}

export function isVertexImageRequest(model: string): boolean {
  const resolved = IMAGE_MODEL_ALIASES[model] || model;
  return isGeminiImageModel(resolved) || isImagenModel(resolved) || /^google-imagen/i.test(resolved);
}

export function isVeoModel(model: string): boolean {
  return /^veo-/i.test(model);
}

function host(location: string): string {
  return location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`;
}

function imageLocation(model: MediaModelInfo | { location?: string }): string {
  return (
    env("VERTEX_IMAGE_LOCATION") ||
    env("VERTEX_IMAGEN_LOCATION") ||
    model.location ||
    "global"
  );
}

function videoLocation(model: MediaModelInfo | { location?: string }): string {
  return env("VERTEX_VEO_LOCATION") || model.location || "us-central1";
}

function resolveImageModel(modelId: string): MediaModelInfo {
  const resolved = IMAGE_MODEL_ALIASES[modelId] || modelId;
  const found = VERTEX_IMAGE_MODELS.find((m) => m.id === resolved);
  if (found) return found;
  if (isImagenModel(resolved) || /^google-imagen/i.test(resolved)) {
    return {
      id: resolved,
      kind: "imagen",
      location: env("VERTEX_IMAGEN_LOCATION") || "us-central1",
      listed: false,
      display_name: resolved,
    };
  }
  return {
    id: resolved,
    kind: "gemini-image",
    location: env("VERTEX_IMAGE_LOCATION") || "global",
    listed: false,
    display_name: resolved,
  };
}

const VIDEO_MODEL_ALIASES: Record<string, string> = {
  "luma-dream-machine": "veo-3.1-fast-generate-001",
  "google-veo-2": "veo-3.1-generate-001",
  "opendoor-veo-cinematic": "veo-3.1-generate-001",
  "wan-2-1-video": "veo-3.1-fast-generate-001",
  "ltx-video-fast": "veo-3.1-fast-generate-001",
  "animatediff-v3": "veo-3.1-fast-generate-001",
  "opendoor-runway-motion-v3": "veo-3.1-fast-generate-001",
  "veo-3.1-fast": "veo-3.1-fast-generate-001",
  "veo-3.1": "veo-3.1-generate-001",
};

function resolveVideoModel(modelId: string): MediaModelInfo {
  const resolved = VIDEO_MODEL_ALIASES[modelId] || modelId;
  return (
    VERTEX_VIDEO_MODELS.find((m) => m.id === resolved) || {
      id: resolved,
      kind: "veo",
      location: env("VERTEX_VEO_LOCATION") || "us-central1",
      listed: false,
      display_name: resolved,
    }
  );
}

async function authHeaders(url: URL): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = env("VERTEX_API_KEY");
  if (apiKey) {
    url.searchParams.set("key", apiKey);
    return headers;
  }
  const token = await getGcpAccessToken();
  if (!token) {
    throw new VertexMediaConfigError(
      "Vertex media is not configured. Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID and Application Default Credentials, or VERTEX_API_KEY."
    );
  }
  headers.Authorization = `Bearer ${token}`;
  const project = vertexProjectId();
  if (project) headers["x-goog-user-project"] = project;
  return headers;
}

function requireProject(): string {
  const project = vertexProjectId();
  if (!project) {
    throw new VertexMediaConfigError(
      "Vertex media is not configured. Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID and Application Default Credentials, or VERTEX_API_KEY."
    );
  }
  return project;
}

function publisherUrl(location: string, model: string, method: string): URL {
  const project = requireProject();
  return new URL(
    `${host(location)}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:${method}`
  );
}

export class VertexMediaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VertexMediaConfigError";
  }
}

export class VertexMediaUpstreamError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "VertexMediaUpstreamError";
    this.status = status;
  }
}

export type DecodedImage = { b64: string; mime: string };

export function decodeImageInput(value: unknown): DecodedImage | null {
  if (!value) return null;
  if (typeof value === "string") {
    const data = value.trim().match(/^data:([^;]+);base64,(.+)$/s);
    if (data) return { mime: data[1], b64: data[2].replace(/\s/g, "") };
    const trimmed = value.trim();
    if (trimmed) return { mime: "image/png", b64: trimmed.replace(/\s/g, "") };
    return null;
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (typeof row.b64_json === "string") {
      return { mime: "image/png", b64: row.b64_json.replace(/\s/g, "") };
    }
    if (typeof row.bytesBase64Encoded === "string") {
      return {
        mime: typeof row.mimeType === "string" ? row.mimeType : "image/png",
        b64: row.bytesBase64Encoded.replace(/\s/g, ""),
      };
    }
    if (typeof row.url === "string") return decodeImageInput(row.url);
    if (row.image) return decodeImageInput(row.image);
  }
  return null;
}

export function aspectRatioFromSize(size?: string, aspect?: string): string | undefined {
  if (aspect && /^\d+:\d+$/.test(aspect)) return aspect;
  if (!size) return undefined;
  if (/^\d+:\d+$/.test(size)) return size;
  const m = size.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) return undefined;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return undefined;
  if (w === h) return "1:1";
  const ratio = w / h;
  const candidates: Array<[string, number]> = [
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["3:2", 3 / 2],
    ["2:3", 2 / 3],
  ];
  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(ratio - c[1]) < Math.abs(ratio - best[1])) best = c;
  }
  return Math.abs(ratio - best[1]) < 0.12 ? best[0] : undefined;
}

async function vertexPost(
  url: URL,
  body: unknown,
  timeoutMs: number
): Promise<{ status: number; json: any; text: string }> {
  const headers = await authHeaders(url);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* raw */
  }
  return { status: res.status, json, text };
}

function upstreamMessage(status: number, json: any, text: string, hint?: string): string {
  const msg =
    json?.error?.message ||
    (typeof json?.error === "string" ? json.error : "") ||
    text.slice(0, 400) ||
    `Vertex media request failed (${status})`;
  if (status === 404 && hint) return `${msg} ${hint}`;
  return msg;
}

export type GeneratedImage = { b64_json: string; mimeType?: string; revised_prompt?: string };

export async function generateVertexImage(opts: {
  model?: string;
  prompt: string;
  n?: number;
  size?: string;
  aspect_ratio?: string;
  image_size?: "1K" | "2K" | "4K";
  quality?: string;
  image?: unknown;
  mask?: unknown;
}): Promise<{ model: string; images: GeneratedImage[] }> {
  if (!vertexMediaConfigured()) {
    throw new VertexMediaConfigError(
      "Image generation is not configured. Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID and Application Default Credentials."
    );
  }
  const model = resolveImageModel(opts.model || defaultImageModel());
  const image = decodeImageInput(opts.image);
  const mask = decodeImageInput(opts.mask);
  if (model.kind === "imagen") {
    return generateImagen({ ...opts, model, image, mask });
  }
  return generateGeminiImage({
    ...opts,
    model,
    image,
    image_size: geminiImageSize(opts.image_size, opts.quality),
  });
}

function geminiImageSize(imageSize?: "1K" | "2K" | "4K", quality?: string): "1K" | "2K" | "4K" {
  if (imageSize === "1K" || imageSize === "2K" || imageSize === "4K") return imageSize;
  if (quality === "high" || quality === "4k" || quality === "4K") return "4K";
  if (quality === "medium" || quality === "1080p" || quality === "2K") return "2K";
  return "1K";
}

async function generateImagen(opts: {
  model: MediaModelInfo;
  prompt: string;
  n?: number;
  size?: string;
  aspect_ratio?: string;
  image?: DecodedImage | null;
  mask?: DecodedImage | null;
}): Promise<{ model: string; images: GeneratedImage[] }> {
  const loc = imageLocation(opts.model);
  const url = publisherUrl(loc, opts.model.id, "predict");
  const n = Math.min(Math.max(opts.n ?? 1, 1), 4);
  const aspectRatio = aspectRatioFromSize(opts.size, opts.aspect_ratio);
  const instance: Record<string, unknown> = { prompt: opts.prompt };
  if (opts.image) {
    const refs: Array<Record<string, unknown>> = [
      {
        referenceType: "REFERENCE_TYPE_RAW",
        referenceId: 1,
        referenceImage: { bytesBase64Encoded: opts.image.b64 },
      },
    ];
    if (opts.mask) {
      refs.push({
        referenceType: "REFERENCE_TYPE_MASK",
        referenceId: 2,
        referenceImage: { bytesBase64Encoded: opts.mask.b64 },
        maskImageConfig: { maskMode: "MASK_MODE_USER_PROVIDED" },
      });
    }
    instance.referenceImages = refs;
  }
  const parameters: Record<string, unknown> = { sampleCount: n };
  if (aspectRatio) parameters.aspectRatio = aspectRatio;
  if (opts.image) parameters.editMode = "EDIT_MODE_INPAINT_INSERTION";

  const r = await vertexPost(url, { instances: [instance], parameters }, 90_000);
  if (r.status === 404) {
    throw new VertexMediaUpstreamError(404, upstreamMessage(r.status, r.json, r.text, IMAGEN_ENABLE_HINT));
  }
  if (r.status < 200 || r.status >= 300) {
    throw new VertexMediaUpstreamError(
      r.status >= 400 && r.status < 600 ? r.status : 502,
      upstreamMessage(r.status, r.json, r.text)
    );
  }
  const predictions = Array.isArray(r.json?.predictions) ? r.json.predictions : [];
  const images: GeneratedImage[] = [];
  for (const pred of predictions) {
    const b64 = pred?.bytesBase64Encoded;
    if (typeof b64 === "string" && b64) {
      images.push({
        b64_json: b64,
        mimeType: typeof pred.mimeType === "string" ? pred.mimeType : "image/png",
        revised_prompt: typeof pred.prompt === "string" ? pred.prompt : undefined,
      });
    }
  }
  if (!images.length) {
    throw new VertexMediaUpstreamError(
      502,
      "Imagen returned no image bytes (empty predictions or safety filter). No image was invented."
    );
  }
  return { model: opts.model.id, images };
}

async function generateGeminiImage(opts: {
  model: MediaModelInfo;
  prompt: string;
  n?: number;
  size?: string;
  aspect_ratio?: string;
  image_size?: "1K" | "2K" | "4K";
  image?: DecodedImage | null;
}): Promise<{ model: string; images: GeneratedImage[] }> {
  const loc = imageLocation(opts.model);
  const n = Math.min(Math.max(opts.n ?? 1, 1), 4);
  const aspectRatio = aspectRatioFromSize(opts.size, opts.aspect_ratio) || "1:1";
  const imageSize = opts.image_size || "1K";
  const images: GeneratedImage[] = [];
  for (let i = 0; i < n; i++) {
    const parts: Array<Record<string, unknown>> = [];
    if (opts.image) {
      parts.push({
        inlineData: { mimeType: opts.image.mime, data: opts.image.b64 },
      });
    }
    parts.push({
      text: opts.image
        ? opts.prompt
        : n > 1
          ? `${opts.prompt}\n\nReturn exactly one image.`
          : opts.prompt,
    });
    const url = publisherUrl(loc, opts.model.id, "generateContent");
    const r = await vertexPost(
      url,
      {
        contents: { role: "user", parts },
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio,
            ...(opts.model.id.includes("gemini-3") ? { imageSize } : {}),
          },
        },
      },
      90_000
    );
    if (r.status === 404) {
      throw new VertexMediaUpstreamError(
        404,
        upstreamMessage(
          r.status,
          r.json,
          r.text,
          "Enable this Gemini image model in Vertex Model Garden, or use gemini-3.1-flash-image."
        )
      );
    }
    if (r.status < 200 || r.status >= 300) {
      throw new VertexMediaUpstreamError(
        r.status >= 400 && r.status < 600 ? r.status : 502,
        upstreamMessage(r.status, r.json, r.text)
      );
    }
    const outParts = r.json?.candidates?.[0]?.content?.parts || [];
    let found = false;
    for (const part of outParts) {
      const data = part?.inlineData?.data || part?.inline_data?.data;
      if (typeof data === "string" && data) {
        images.push({
          b64_json: data,
          mimeType: part?.inlineData?.mimeType || part?.inline_data?.mimeType || "image/png",
        });
        found = true;
      }
    }
    if (!found) {
      throw new VertexMediaUpstreamError(
        502,
        "Gemini image generation returned no image bytes. No image was invented."
      );
    }
  }
  return { model: opts.model.id, images };
}

export type VeoStartResult = {
  model: string;
  location: string;
  operationName: string;
};

export async function startVeoGeneration(opts: {
  model?: string;
  prompt: string;
  n?: number;
  duration?: number;
  size?: string;
  aspect_ratio?: string;
  image?: unknown;
}): Promise<VeoStartResult> {
  if (!vertexMediaConfigured()) {
    throw new VertexMediaConfigError(
      "Video generation is not configured. Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID and Application Default Credentials for Vertex Veo."
    );
  }
  const model = resolveVideoModel(opts.model || defaultVideoModel());
  const loc = videoLocation(model);
  const url = publisherUrl(loc, model.id, "predictLongRunning");
  const n = Math.min(Math.max(opts.n ?? 1, 1), 4);
  const aspectRatio = aspectRatioFromSize(opts.size, opts.aspect_ratio) || "16:9";
  const duration = normalizeVeoDuration(model.id, opts.duration);
  const instance: Record<string, unknown> = { prompt: opts.prompt };
  const image = decodeImageInput(opts.image);
  if (image) {
    instance.image = { bytesBase64Encoded: image.b64, mimeType: image.mime };
  }
  const parameters: Record<string, unknown> = {
    sampleCount: n,
    aspectRatio,
    durationSeconds: duration,
  };
  const r = await vertexPost(url, { instances: [instance], parameters }, 45_000);
  if (r.status === 404) {
    throw new VertexMediaUpstreamError(404, upstreamMessage(r.status, r.json, r.text, VEO_ENABLE_HINT));
  }
  if (r.status < 200 || r.status >= 300) {
    throw new VertexMediaUpstreamError(
      r.status >= 400 && r.status < 600 ? r.status : 502,
      upstreamMessage(r.status, r.json, r.text)
    );
  }
  const operationName = typeof r.json?.name === "string" ? r.json.name : "";
  if (!operationName.includes("/operations/")) {
    throw new VertexMediaUpstreamError(502, "Veo did not return a valid long-running operation. No video was invented.");
  }
  return { model: model.id, location: loc, operationName };
}

export type VeoPollResult = {
  done: boolean;
  videos: Array<{ b64?: string; mimeType?: string; gcsUri?: string }>;
  error?: string;
};

export async function pollVeoOperation(opts: {
  model: string;
  location: string;
  operationName: string;
}): Promise<VeoPollResult> {
  const url = publisherUrl(opts.location, opts.model, "fetchPredictOperation");
  const r = await vertexPost(url, { operationName: opts.operationName }, 30_000);
  if (r.status < 200 || r.status >= 300) {
    throw new VertexMediaUpstreamError(
      r.status >= 400 && r.status < 600 ? r.status : 502,
      upstreamMessage(r.status, r.json, r.text)
    );
  }
  if (r.json?.error?.message) {
    return { done: true, videos: [], error: String(r.json.error.message) };
  }
  if (!r.json?.done) {
    return { done: false, videos: [] };
  }
  const resp = r.json.response || {};
  const raw = resp.videos || resp.generatedVideos || [];
  const videos: VeoPollResult["videos"] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    const b64 = v?.bytesBase64Encoded;
    const gcsUri = v?.gcsUri || v?.uri;
    if (typeof b64 === "string" && b64) {
      videos.push({ b64, mimeType: v.mimeType || "video/mp4" });
    } else if (typeof gcsUri === "string" && gcsUri) {
      videos.push({ gcsUri, mimeType: v.mimeType || "video/mp4" });
    }
  }
  if (!videos.length) {
    const filtered = Number(resp.raiMediaFilteredCount || 0);
    return {
      done: true,
      videos: [],
      error: filtered
        ? "Veo filtered the result (safety). No video was invented."
        : "Veo finished without video bytes. No video was invented.",
    };
  }
  return { done: true, videos };
}

function normalizeVeoDuration(modelId: string, duration?: number): number {
  const n = Number(duration);
  if (modelId.startsWith("veo-2")) {
    if (Number.isFinite(n) && n >= 5 && n <= 8) return Math.round(n);
    return 8;
  }
  if (Number.isFinite(n) && (n === 4 || n === 6 || n === 8)) return n;
  if (Number.isFinite(n) && n > 0) {
    if (n <= 4) return 4;
    if (n <= 6) return 6;
    return 8;
  }
  return 4;
}
