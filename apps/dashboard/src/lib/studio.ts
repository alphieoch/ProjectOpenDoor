import { and, eq } from "drizzle-orm";
import { deployments } from "@opendoor/database";
import {
  PRIVATE_GPU_OFFLINE,
  comfyAdapterEnabled,
  configuredPrivateImageUrl,
  discoverPrivateImageEndpoint,
  parseStudioMode,
  probeComfyVideo,
  resolvedPrivateImageKind,
  resolvedPrivateImageUrl,
  studioCloudImageReady,
  type StudioGenerateMode,
} from "@opendoor/shared";
import { assistantGatewayHeaders, assistantGatewayUrl } from "@/lib/assistant-gateway";
import { getDb } from "@/lib/db";
import {
  OPENDOOR_STUDIO_MODELS,
  resolutionToGeminiSize,
  sizeFromAspectAndResolution,
  type StudioResolution,
} from "./studio-constants";

export * from "./studio-constants";

export const STUDIO_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const STUDIO_VIDEO_MAX_BYTES = 48 * 1024 * 1024;

export const ASPECT_TO_SIZE: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1280x720",
  "9:16": "720x1280",
  "4:3": "1024x768",
  "3:2": "1152x768",
  "3:4": "768x1024",
  "21:9": "1344x576",
};

export async function studioExtraUrls(orgId: string): Promise<string[]> {
  try {
    const db = getDb();
    const rows = await db.query.deployments.findMany({
      where: and(
        eq(deployments.organizationId, orgId),
        eq(deployments.sourceType, "image"),
        eq(deployments.status, "running")
      ),
    });
    return rows.map((row) => (row.fqdn || "").replace(/\/$/, "")).filter(Boolean);
  } catch {
    return [];
  }
}

export function studioOfflineError(message?: string): string {
  if (!message) return PRIVATE_GPU_OFFLINE;
  if (/comfy|8188|a1111|private gpu offline|start comfy/i.test(message)) {
    return PRIVATE_GPU_OFFLINE;
  }
  return message;
}

export function parseStudioQuality(raw: unknown): StudioResolution {
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  if (raw === "4k" || raw === "4K" || raw === "2160p") return "high";
  if (raw === "1080p" || raw === "2K") return "medium";
  return "low";
}

export function parseStudioSize(size?: string): { width: number; height: number } {
  const [w, h] = String(size || "1024x1024").split("x").map(Number);
  return {
    width: w > 0 ? Math.min(1920, Math.round(w)) : 1024,
    height: h > 0 ? Math.min(1920, Math.round(h)) : 1024,
  };
}

export function studioCloudImageUrl(prompt: string, size?: string, seed?: number) {
  const { width, height } = parseStudioSize(size);
  const q = encodeURIComponent((prompt || "cinematic studio still").slice(0, 280));
  return `https://image.pollinations.ai/prompt/${q}?width=${width}&height=${height}&nologo=true&seed=${seed || Date.now() % 1_000_000}&model=flux`;
}

export function studioCloudVideoUrl() {
  return "";
}

export function studioGatewaySecret() {
  return process.env.GATEWAY_INTERNAL_KEY || process.env.INTERNAL_API_KEY || "";
}

export function studioGatewayUrl() {
  return assistantGatewayUrl();
}

export function studioGatewayHeaders(orgId: string, json = true) {
  const headers = assistantGatewayHeaders(orgId);
  if (!json) {
    const next = { ...headers };
    delete (next as { "Content-Type"?: string })["Content-Type"];
    return next;
  }
  return headers;
}

export async function studioGpuStatus(orgId: string) {
  const extraUrls = await studioExtraUrls(orgId);
  const endpoint = await discoverPrivateImageEndpoint(extraUrls);
  const cloud = studioCloudImageReady();
  const online = Boolean(endpoint) || cloud;
  const url = endpoint?.url || resolvedPrivateImageUrl();
  const kind = endpoint?.kind || (url ? resolvedPrivateImageKind() : null);
  const video =
    endpoint?.kind === "comfy" && comfyAdapterEnabled()
      ? await probeComfyVideo(endpoint.url)
      : {
          ready: cloud,
          loadNode: null,
          combineNode: null,
          animateDiffNode: null,
          wanNodes: [],
          missingNodes: [] as string[],
          nodeCount: 0,
        };

  return {
    online,
    pipelineReady: online,
    engine: online ? "Studio" : "Studio offline",
    url,
    kind,
    label: online ? "Studio is live" : "Studio is offline",
    configured: Boolean(configuredPrivateImageUrl()) || cloud,
    dedicated: extraUrls,
    models: OPENDOOR_STUDIO_MODELS,
    hasGpu: Boolean(endpoint) || cloud,
    hasVertex: cloud,
    video,
  };
}

export type StudioMediaInput = {
  bytes: Uint8Array;
  mime: string;
  filename: string;
};

function isUpload(value: unknown): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).size === "number"
  );
}

export async function readStudioRequest(req: Request): Promise<{
  mode: StudioGenerateMode | null;
  prompt: string;
  size: string;
  strength: number;
  model: string;
  seed: number;
  steps: number;
  negativePrompt: string;
  stylePreset: string;
  targetTime?: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
  n: number;
  quality: StudioResolution;
  aspectRatio?: string;
  imageSize: "1K" | "2K" | "4K";
  image?: StudioMediaInput;
  video?: StudioMediaInput;
}> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const imageField = form.get("image") || form.get("file");
    const videoField = form.get("video");
    let image: StudioMediaInput | undefined;
    let video: StudioMediaInput | undefined;
    if (isUpload(imageField) && imageField.size > 0) {
      image = {
        bytes: new Uint8Array(await imageField.arrayBuffer()),
        mime: imageField.type || "image/png",
        filename: imageField.name || "input.png",
      };
    } else if (typeof imageField === "string" && imageField.trim()) {
      const { decodeMediaString } = await import("@opendoor/shared");
      const decoded = decodeMediaString(imageField, "input.png");
      if (decoded) image = decoded;
    }
    if (isUpload(videoField) && videoField.size > 0) {
      video = {
        bytes: new Uint8Array(await videoField.arrayBuffer()),
        mime: videoField.type || "video/mp4",
        filename: videoField.name || "input.mp4",
      };
    } else if (typeof videoField === "string" && videoField.trim()) {
      const { decodeMediaString } = await import("@opendoor/shared");
      const decoded = decodeMediaString(videoField, "input.mp4");
      if (decoded) video = decoded;
    }
    const quality = parseStudioQuality(form.get("quality") || form.get("resolution"));
    const aspectRatio = form.get("aspectRatio") || form.get("aspect_ratio") ? String(form.get("aspectRatio") || form.get("aspect_ratio")) : undefined;
    return {
      mode: parseStudioMode(form.get("mode")),
      prompt: String(form.get("prompt") || "").trim(),
      size: String(form.get("size") || (aspectRatio ? sizeFromAspectAndResolution(aspectRatio, quality) : "1024x1024")),
      strength: Number(form.get("strength") || 0.75),
      model: String(form.get("model") || "gemini-3.1-flash-image"),
      seed: Number(form.get("seed") || Math.floor(Math.random() * 1_000_000)),
      steps: Number(form.get("steps") || 28),
      negativePrompt: String(form.get("negative_prompt") || form.get("negativePrompt") || ""),
      stylePreset: String(form.get("stylePreset") || "none"),
      targetTime: form.get("target_time") != null || form.get("targetTime") != null ? Number(form.get("target_time") || form.get("targetTime")) : undefined,
      startTime: form.get("start_time") != null || form.get("startTime") != null ? Number(form.get("start_time") || form.get("startTime")) : undefined,
      endTime: form.get("end_time") != null || form.get("endTime") != null ? Number(form.get("end_time") || form.get("endTime")) : undefined,
      duration: form.get("duration") != null ? Number(form.get("duration")) : undefined,
      n: Math.min(Math.max(Number(form.get("n") || form.get("variations") || 1), 1), 4),
      quality,
      aspectRatio,
      imageSize: resolutionToGeminiSize(quality),
      image,
      video,
    };
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { decodeMediaString } = await import("@opendoor/shared");
  let image: StudioMediaInput | undefined;
  let video: StudioMediaInput | undefined;
  const imageInput = typeof body.image === "string" ? body.image : typeof body.referenceImage === "string" ? body.referenceImage : null;
  if (imageInput) {
    const decoded = decodeMediaString(imageInput, "input.png");
    if (decoded) image = decoded;
  } else if (body.image && typeof body.image === "object") {
    const obj = body.image as { b64_json?: string; mime?: string; filename?: string };
    if (typeof obj.b64_json === "string") {
      const decoded = decodeMediaString(
        obj.b64_json.startsWith("data:")
          ? obj.b64_json
          : `data:${obj.mime || "image/png"};base64,${obj.b64_json}`,
        obj.filename || "input.png"
      );
      if (decoded) image = decoded;
    }
  }
  if (typeof body.video === "string") {
    const decoded = decodeMediaString(body.video, "input.mp4");
    if (decoded) video = decoded;
  }
  const quality = parseStudioQuality(body.quality ?? body.resolution);
  const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : typeof body.aspect_ratio === "string" ? body.aspect_ratio : undefined;
  return {
    mode: parseStudioMode(body.mode),
    prompt: typeof body.prompt === "string" ? body.prompt.trim() : "",
    size:
      typeof body.size === "string"
        ? body.size
        : aspectRatio
          ? sizeFromAspectAndResolution(aspectRatio, quality)
          : "1024x1024",
    strength: typeof body.strength === "number" ? body.strength : 0.75,
    model: typeof body.model === "string" ? body.model : "gemini-3.1-flash-image",
    seed: typeof body.seed === "number" ? body.seed : Math.floor(Math.random() * 1_000_000),
    steps: typeof body.steps === "number" ? body.steps : 28,
    negativePrompt:
      typeof body.negative_prompt === "string"
        ? body.negative_prompt
        : typeof body.negativePrompt === "string"
          ? body.negativePrompt
          : "",
    stylePreset: typeof body.stylePreset === "string" ? body.stylePreset : "none",
    targetTime:
      typeof body.targetTime === "number"
        ? body.targetTime
        : typeof body.target_time === "number"
          ? body.target_time
          : undefined,
    startTime:
      typeof body.startTime === "number"
        ? body.startTime
        : typeof body.start_time === "number"
          ? body.start_time
          : undefined,
    endTime:
      typeof body.endTime === "number"
        ? body.endTime
        : typeof body.end_time === "number"
          ? body.end_time
          : undefined,
    duration: typeof body.duration === "number" ? body.duration : undefined,
    n: Math.min(Math.max(Number(body.n ?? body.variations ?? 1), 1), 4),
    quality,
    aspectRatio,
    imageSize: resolutionToGeminiSize(quality),
    image,
    video,
  };
}
