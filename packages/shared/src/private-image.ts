import {
  COMFY_NO_CHECKPOINT,
  PRIVATE_GPU_OFFLINE,
  PrivateImageDownError,
  authedFetch,
  bytesToB64,
  clamp01,
  decodeMediaString,
  env,
  fetchOk,
  isConnectFail,
  offlineError,
  parseSize,
  runComfyPrompt,
  uploadComfyInput,
  viewComfyFile,
  type DecodedMedia,
} from "./private-comfy.js";

export {
  COMFY_NO_CHECKPOINT,
  PRIVATE_GPU_OFFLINE,
  PrivateImageDownError,
  decodeMediaString,
  isPrivateImageDown,
} from "./private-comfy.js";

export type PrivateImageKind = "openai" | "a1111" | "comfy";
export type PrivateImageMode = "txt2img" | "img2img";
export type StudioGenerateMode = "txt2img" | "img2img" | "txt2vid" | "img2vid" | "v2v" | "nodes";

export type PrivateImageResult = {
  b64: string;
  mime: string;
};

export type PrivateImageProbe = {
  url: string;
  kind: PrivateImageKind;
  checkpoint?: string;
};

export const PREMIUM_IMAGE_MODELS = [
  {
    id: "flux-1-schnell",
    displayName: "FLUX.1 Schnell",
    status: "live" as const,
    modality: "image",
    weightsUri: "black-forest-labs/FLUX.1-schnell",
    note: "Served on an OpenAI-compatible image worker (PRIVATE_IMAGE_GEN_URL) or the Studio cloud path.",
  },
  {
    id: "minimax-h3",
    displayName: "MiniMax H3",
    status: "available_on_request" as const,
    modality: "omni",
    weightsUri: "MiniMaxAI/MiniMax-H3",
    note: "33B omni-modal video weights on Hugging Face. Not Hailuo’s hosted API, not a chat LLM. Rent the private GPU and load the weights URI.",
  },
] as const;

export const DEFAULT_PRIVATE_IMAGE_URL = "";
export const DEFAULT_PRIVATE_IMAGE_KIND: PrivateImageKind = "openai";

export function configuredPrivateImageUrl(): string {
  return env("PRIVATE_IMAGE_GEN_URL").replace(/\/$/, "");
}

export function configuredPrivateImageKind(): PrivateImageKind | null {
  const k = env("PRIVATE_IMAGE_GEN_KIND").toLowerCase();
  if (k === "a1111" || k === "comfy" || k === "openai") return k;
  return null;
}

export function comfyAdapterEnabled(): boolean {
  return configuredPrivateImageKind() === "comfy";
}

export function resolvedPrivateImageUrl(): string {
  return configuredPrivateImageUrl();
}

export function resolvedPrivateImageKind(): PrivateImageKind {
  const k = configuredPrivateImageKind();
  if (k) return k;
  const url = resolvedPrivateImageUrl();
  if (url.includes(":7860")) return "a1111";
  return DEFAULT_PRIVATE_IMAGE_KIND;
}

export function formatPrivateImageLabel(url?: string | null, kind?: string | null): string {
  const host = (url || resolvedPrivateImageUrl()).replace(/^https?:\/\//, "");
  if (!host) return "Studio";
  const name = kind === "a1111" ? "A1111" : "Studio";
  return `${name} · ${host}`;
}

export function privateImageOfflineHint(_url?: string | null): string {
  return PRIVATE_GPU_OFFLINE;
}

export function privateImageFallbackAllowed(): boolean {
  return env("PRIVATE_IMAGE_GEN_ALLOW_FALLBACK") === "1";
}

export function cloudImageKeysPresent(): boolean {
  return Boolean(
    env("OPENAI_API_KEY") ||
      (env("AZURE_AI_FOUNDRY_ENDPOINT") && env("AZURE_AI_FOUNDRY_KEY"))
  );
}

export function studioCloudImageReady(): boolean {
  return (
    cloudImageKeysPresent() ||
    Boolean(
      env("GOOGLE_CLOUD_PROJECT") ||
        env("GCP_PROJECT") ||
        env("GCP_PROJECT_ID") ||
        env("VERTEX_API_KEY") ||
        env("GOOGLE_APPLICATION_CREDENTIALS")
    )
  );
}

export function wantsPrivateGpuBackend(model?: string, backendHeader?: string): boolean {
  const backend = (backendHeader || "").trim().toLowerCase();
  const m = (model || "").trim();
  return backend === "private" || m === "premium:private" || m.startsWith("premium:");
}

export function parseStudioMode(raw: unknown): StudioGenerateMode | null {
  if (
    raw === "txt2img" ||
    raw === "img2img" ||
    raw === "txt2vid" ||
    raw === "img2vid" ||
    raw === "v2v" ||
    raw === "nodes"
  ) {
    return raw;
  }
  return null;
}

async function probeOpenAiImages(base: string): Promise<boolean> {
  try {
    const res = await authedFetch(`${base}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(4000),
    });
    return res.status !== 404 && res.status < 500;
  } catch {
    return false;
  }
}

export async function probeImageKind(
  base: string,
  opts?: { allowComfy?: boolean }
): Promise<PrivateImageKind | null> {
  const root = base.replace(/\/$/, "");
  if ((await fetchOk(`${root}/v1/models`)) || (await fetchOk(`${root}/health`))) {
    return "openai";
  }
  if (await fetchOk(`${root}/sdapi/v1/sd-models`)) return "a1111";
  if (await probeOpenAiImages(root)) return "openai";
  if (opts?.allowComfy) {
    if (
      (await fetchOk(`${root}/system_stats`, 4000)) ||
      (await fetchOk(`${root}/object_info`, 8000))
    ) {
      return "comfy";
    }
  }
  return null;
}

export async function discoverPrivateImageEndpoint(
  extraUrls: string[] = []
): Promise<PrivateImageProbe | null> {
  const configured = configuredPrivateImageUrl();
  const configuredKind = configuredPrivateImageKind();
  const allowComfy = configuredKind === "comfy";
  const seen = new Set<string>();
  const queue: Array<{ url: string; kind?: PrivateImageKind | null }> = [];

  if (configured) queue.push({ url: configured, kind: configuredKind || "openai" });
  for (const url of extraUrls) {
    if (url) queue.push({ url: url.replace(/\/$/, ""), kind: configuredKind });
  }

  for (const item of queue) {
    const url = item.url.replace(/\/$/, "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const probed = await probeImageKind(url, { allowComfy });
    if (!probed) continue;
    if (probed === "comfy" && !allowComfy) continue;
    if (item.kind && item.kind !== probed && !(item.kind === "openai" && probed === "openai")) {
      if (item.kind === "comfy" && probed === "comfy") {
        return { url, kind: "comfy" };
      }
      if (item.kind !== probed) continue;
    }
    return { url, kind: probed };
  }
  return null;
}

async function generateOpenAiCompatible(
  base: string,
  opts: {
    prompt: string;
    size?: string;
    image?: DecodedMedia;
    strength?: number;
  }
): Promise<PrivateImageResult> {
  const payload: Record<string, unknown> = {
    prompt: opts.prompt,
    n: 1,
    size: opts.size || "1024x1024",
    response_format: "b64_json",
  };
  if (opts.image) {
    payload.image = `data:${opts.image.mime};base64,${bytesToB64(opts.image.bytes)}`;
    payload.strength = opts.strength ?? 0.75;
  }
  const res = await authedFetch(`${base}/v1/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    throw new Error(`Private image endpoint error: ${(await res.text()).slice(0, 800)}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const b64 = data.data?.[0]?.b64_json;
  if (b64) return { b64, mime: "image/png" };
  const url = data.data?.[0]?.url;
  if (url) {
    const img = await authedFetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new Error("Private image URL fetch failed");
    return {
      b64: bytesToB64(await img.arrayBuffer()),
      mime: img.headers.get("content-type") || "image/png",
    };
  }
  throw new Error("Private image endpoint returned no image");
}

async function generateA1111(
  base: string,
  opts: {
    prompt: string;
    size?: string;
    mode?: PrivateImageMode;
    image?: DecodedMedia;
    strength?: number;
    seed?: number;
    steps?: number;
    negativePrompt?: string;
  }
): Promise<PrivateImageResult> {
  const { width, height } = parseSize(opts.size);
  const mode = opts.mode || "txt2img";
  if (mode === "img2img") {
    if (!opts.image) throw new Error("image is required for img2img");
    const res = await authedFetch(`${base}/sdapi/v1/img2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: opts.prompt,
        negative_prompt: opts.negativePrompt || "",
        init_images: [bytesToB64(opts.image.bytes)],
        denoising_strength: clamp01(opts.strength ?? 0.75),
        width,
        height,
        steps: opts.steps ?? 20,
        seed: opts.seed ?? -1,
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      throw new Error(`Private img2img error: ${(await res.text()).slice(0, 800)}`);
    }
    const data = (await res.json()) as { images?: string[] };
    const b64 = data.images?.[0];
    if (!b64) throw new Error("Private image endpoint returned no image");
    return { b64, mime: "image/png" };
  }

  const res = await authedFetch(`${base}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      negative_prompt: opts.negativePrompt || "",
      width,
      height,
      steps: opts.steps ?? 20,
      seed: opts.seed ?? -1,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    throw new Error(`Private image endpoint error: ${(await res.text()).slice(0, 800)}`);
  }
  const data = (await res.json()) as { images?: string[] };
  const b64 = data.images?.[0];
  if (!b64) throw new Error("Private image endpoint returned no image");
  return { b64, mime: "image/png" };
}

type ComfyObjectInfo = {
  CheckpointLoaderSimple?: {
    input?: { required?: { ckpt_name?: [string[], ...unknown[]] } };
  };
  input?: { required?: { ckpt_name?: [string[], ...unknown[]] } };
};

function checkpointNamesFromInfo(info: unknown): string[] {
  if (!info || typeof info !== "object") return [];
  const root = info as ComfyObjectInfo;
  const list =
    root.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ||
    root.input?.required?.ckpt_name?.[0];
  if (!Array.isArray(list)) return [];
  return list.filter((n): n is string => typeof n === "string" && n.length > 0);
}

export async function listComfyCheckpoints(base: string): Promise<string[]> {
  const names = new Set<string>();
  try {
    const res = await authedFetch(`${base}/object_info/CheckpointLoaderSimple`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      for (const n of checkpointNamesFromInfo(await res.json())) names.add(n);
    }
  } catch {
    /* gated adapter only */
  }
  if (names.size === 0) {
    try {
      const res = await authedFetch(`${base}/object_info`, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) {
        for (const n of checkpointNamesFromInfo(await res.json())) names.add(n);
      }
    } catch {
      /* gated adapter only */
    }
  }
  if (names.size === 0) {
    try {
      const res = await authedFetch(`${base}/models/checkpoints`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          for (const n of list) if (typeof n === "string" && n) names.add(n);
        }
      }
    } catch {
      /* none listed */
    }
  }
  return [...names];
}

export async function resolveComfyCheckpoint(base: string): Promise<string> {
  const wanted = env("PRIVATE_IMAGE_GEN_CHECKPOINT").trim();
  const available = await listComfyCheckpoints(base);
  if (wanted) return wanted;
  if (available[0]) return available[0];
  throw new PrivateImageDownError(COMFY_NO_CHECKPOINT, false);
}

function comfyTxt2ImgWorkflow(opts: {
  prompt: string;
  negativePrompt?: string;
  ckpt: string;
  width: number;
  height: number;
  seed?: number;
  steps?: number;
}) {
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: opts.seed ?? Date.now() % 1_000_000_000,
        steps: opts.steps ?? 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: opts.ckpt },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: opts.width, height: opts.height, batch_size: 1 },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: opts.prompt, clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: opts.negativePrompt || "", clip: ["4", 1] },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "opendoor", images: ["8", 0] },
    },
  };
}

function comfyImg2ImgWorkflow(opts: {
  prompt: string;
  negativePrompt?: string;
  ckpt: string;
  imageName: string;
  width: number;
  height: number;
  strength: number;
  seed?: number;
  steps?: number;
}) {
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: opts.seed ?? Date.now() % 1_000_000_000,
        steps: opts.steps ?? 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: clamp01(opts.strength),
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["10", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: opts.ckpt },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: opts.prompt, clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: opts.negativePrompt || "", clip: ["4", 1] },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "opendoor", images: ["8", 0] },
    },
    "11": {
      class_type: "LoadImage",
      inputs: { image: opts.imageName },
    },
    "12": {
      class_type: "ImageScale",
      inputs: {
        image: ["11", 0],
        width: opts.width,
        height: opts.height,
        upscale_method: "bilinear",
        crop: "center",
      },
    },
    "10": {
      class_type: "VAEEncode",
      inputs: { pixels: ["12", 0], vae: ["4", 2] },
    },
  };
}

export function resolveImageMedia(raw: unknown): DecodedMedia | null {
  if (!raw) return null;
  if (typeof raw === "string") return decodeMediaString(raw, "input.png");
  if (typeof raw === "object") {
    const obj = raw as {
      bytes?: Uint8Array;
      b64?: string;
      b64_json?: string;
      mime?: string;
      filename?: string;
    };
    if (obj.bytes instanceof Uint8Array && obj.bytes.length > 0) {
      return {
        bytes: obj.bytes,
        mime: obj.mime || "image/png",
        filename: obj.filename || "input.png",
      };
    }
    const b64 = obj.b64 || obj.b64_json;
    if (typeof b64 === "string") {
      const decoded = decodeMediaString(
        b64.startsWith("data:") ? b64 : `data:${obj.mime || "image/png"};base64,${b64}`,
        obj.filename || "input.png"
      );
      if (decoded) return decoded;
    }
  }
  return null;
}

async function generateComfy(
  base: string,
  opts: {
    prompt: string;
    size?: string;
    mode?: PrivateImageMode;
    image?: DecodedMedia;
    strength?: number;
    seed?: number;
    steps?: number;
    negativePrompt?: string;
  }
): Promise<{ image: PrivateImageResult; checkpoint: string }> {
  const healthy =
    (await fetchOk(`${base}/system_stats`, 4000)) || (await fetchOk(`${base}/object_info`, 8000));
  if (!healthy) throw offlineError();

  const ckpt = await resolveComfyCheckpoint(base);
  const { width, height } = parseSize(opts.size);
  const mode = opts.mode || "txt2img";

  let workflow: unknown;
  if (mode === "img2img") {
    if (!opts.image) throw new Error("image is required for img2img");
    const uploaded = await uploadComfyInput(base, opts.image, "image");
    workflow = comfyImg2ImgWorkflow({
      prompt: opts.prompt,
      negativePrompt: opts.negativePrompt,
      ckpt,
      imageName: uploaded.name,
      width,
      height,
      strength: opts.strength ?? 0.75,
      seed: opts.seed,
      steps: opts.steps,
    });
  } else {
    workflow = comfyTxt2ImgWorkflow({
      prompt: opts.prompt,
      negativePrompt: opts.negativePrompt,
      ckpt,
      width,
      height,
      seed: opts.seed,
      steps: opts.steps,
    });
  }

  const ran = await runComfyPrompt(base, workflow, { waitFor: "image", timeoutMs: 300_000 });
  const first = ran.images[0];
  if (!first) throw offlineError();
  const file = await viewComfyFile(base, first);
  return { checkpoint: ckpt, image: file };
}

export async function generatePrivateImage(opts: {
  prompt: string;
  size?: string;
  extraUrls?: string[];
  mode?: PrivateImageMode;
  image?: unknown;
  strength?: number;
  seed?: number;
  steps?: number;
  negativePrompt?: string;
}): Promise<{ image: PrivateImageResult; endpoint: PrivateImageProbe }> {
  const mode = opts.mode || "txt2img";
  const image = resolveImageMedia(opts.image);
  if (mode === "img2img" && !image) {
    throw new Error("image is required for img2img");
  }

  const endpoint = await discoverPrivateImageEndpoint(opts.extraUrls || []);
  if (!endpoint) {
    throw offlineError();
  }

  try {
    if (endpoint.kind === "a1111") {
      return {
        image: await generateA1111(endpoint.url, {
          prompt: opts.prompt,
          size: opts.size,
          mode,
          image: image || undefined,
          strength: opts.strength,
          seed: opts.seed,
          steps: opts.steps,
          negativePrompt: opts.negativePrompt,
        }),
        endpoint,
      };
    }
    if (endpoint.kind === "comfy") {
      if (!comfyAdapterEnabled()) throw offlineError();
      const { image: out, checkpoint } = await generateComfy(endpoint.url, {
        prompt: opts.prompt,
        size: opts.size,
        mode,
        image: image || undefined,
        strength: opts.strength,
        seed: opts.seed,
        steps: opts.steps,
        negativePrompt: opts.negativePrompt,
      });
      return { image: out, endpoint: { ...endpoint, checkpoint } };
    }
    return {
      image: await generateOpenAiCompatible(endpoint.url, {
        prompt: opts.prompt,
        size: opts.size,
        image: image || undefined,
        strength: opts.strength,
      }),
      endpoint,
    };
  } catch (err) {
    if (err instanceof PrivateImageDownError) throw err;
    if (isConnectFail(err)) throw offlineError();
    throw err;
  }
}
