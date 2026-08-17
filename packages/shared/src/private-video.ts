import {
  clamp01,
  decodeMediaString,
  fetchComfyObjectInfo,
  fetchOk,
  fillNodeWidgets,
  isConnectFail,
  offlineError,
  parseSize,
  pickCombo,
  runComfyPrompt,
  uploadComfyInput,
  viewComfyFile,
  type DecodedMedia,
} from "./private-comfy.js";
import {
  comfyAdapterEnabled,
  discoverPrivateImageEndpoint,
  resolveComfyCheckpoint,
  resolveImageMedia,
} from "./private-image.js";

export const COMFY_VIDEO_NODES_MISSING = "Studio video unavailable";

const LOAD_VIDEO_NODES = [
  "VHS_LoadVideo",
  "VHS_LoadVideoFFmpeg",
  "VHS_LoadVideoPath",
  "LoadVideo",
  "LoadVideoUpload",
];

const COMBINE_VIDEO_NODES = [
  "VHS_VideoCombine",
  "VHS_VideoCombineFFmpeg",
  "CreateVideo",
  "SaveVideo",
];

const ANIMATE_DIFF_NODES = [
  "ADE_AnimateDiffLoaderGen1",
  "ADE_AnimateDiffLoaderWithContext",
  "ADE_AnimateDiffLoaderV1Advanced",
  "AnimateDiffLoader",
];

const WAN_HINT_NODES = [
  "WanVideoModelLoader",
  "WanVideoSampler",
  "WanVideoDecode",
  "WanVideoEncode",
];

export class PrivateVideoUnavailableError extends Error {
  status = 501 as const;
  missingNodes: string[];
  constructor(missingNodes: string[], detail?: string) {
    const listed = missingNodes.join(", ");
    super(
      detail ||
        `${COMFY_VIDEO_NODES_MISSING}. Missing: ${listed}.`
    );
    this.name = "PrivateVideoUnavailableError";
    this.missingNodes = missingNodes;
  }
}

export function isPrivateVideoUnavailable(err: unknown): err is PrivateVideoUnavailableError {
  return err instanceof PrivateVideoUnavailableError;
}

export type ComfyVideoProbe = {
  ready: boolean;
  loadNode: string | null;
  combineNode: string | null;
  animateDiffNode: string | null;
  wanNodes: string[];
  missingNodes: string[];
  nodeCount: number;
};

function firstPresent(objectInfo: Record<string, unknown>, names: string[]): string | null {
  for (const name of names) {
    if (objectInfo[name]) return name;
  }
  return null;
}

export function probeVideoNodes(objectInfo: Record<string, unknown> | null): ComfyVideoProbe {
  if (!objectInfo) {
    return {
      ready: false,
      loadNode: null,
      combineNode: null,
      animateDiffNode: null,
      wanNodes: [],
      missingNodes: ["VHS_LoadVideo", "VHS_VideoCombine"],
      nodeCount: 0,
    };
  }
  const loadNode = firstPresent(objectInfo, LOAD_VIDEO_NODES);
  const combineNode = firstPresent(objectInfo, COMBINE_VIDEO_NODES);
  const animateDiffNode = firstPresent(objectInfo, ANIMATE_DIFF_NODES);
  const wanNodes = WAN_HINT_NODES.filter((n) => Boolean(objectInfo[n]));
  const missingNodes: string[] = [];
  if (!loadNode) missingNodes.push("VHS_LoadVideo");
  if (!combineNode) missingNodes.push("VHS_VideoCombine");
  return {
    ready: Boolean(loadNode && combineNode),
    loadNode,
    combineNode,
    animateDiffNode,
    wanNodes,
    missingNodes,
    nodeCount: Object.keys(objectInfo).length,
  };
}

export async function probeComfyVideo(base: string): Promise<ComfyVideoProbe> {
  const info = await fetchComfyObjectInfo(base);
  return probeVideoNodes(info);
}

export function resolveVideoMedia(raw: unknown): DecodedMedia | null {
  if (!raw) return null;
  if (typeof raw === "string") return decodeMediaString(raw, "input.mp4");
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
        mime: obj.mime || "video/mp4",
        filename: obj.filename || "input.mp4",
      };
    }
    const b64 = obj.b64 || obj.b64_json;
    if (typeof b64 === "string") {
      return decodeMediaString(
        b64.startsWith("data:") ? b64 : `data:${obj.mime || "video/mp4"};base64,${b64}`,
        obj.filename || "input.mp4"
      );
    }
  }
  return resolveImageMedia(raw);
}

function buildVhsV2vWorkflow(opts: {
  objectInfo: Record<string, unknown>;
  probe: ComfyVideoProbe;
  ckpt: string;
  videoName: string;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  strength: number;
  seed?: number;
  steps?: number;
}) {
  const load = opts.probe.loadNode!;
  const combine = opts.probe.combineNode!;
  const format =
    pickCombo(opts.objectInfo, combine, "format", ["video/h264-mp4", "mp4", "video/mp4"]) ||
    "video/h264-mp4";

  const loadInputs = fillNodeWidgets(opts.objectInfo, load, {
    video: opts.videoName,
    video_path: opts.videoName,
    file: opts.videoName,
    force_rate: 0,
    force_size: pickCombo(opts.objectInfo, load, "force_size", ["Custom", "Disabled"]) || "Custom",
    custom_width: opts.width,
    custom_height: opts.height,
    frame_load_cap: 48,
    skip_first_frames: 0,
    select_every_nth: 1,
  });

  const combineInputs = fillNodeWidgets(opts.objectInfo, combine, {
    images: ["8", 0],
    frame_rate: 16,
    fps: 16,
    loop_count: 0,
    filename_prefix: "opendoor_v2v",
    format,
    pingpong: false,
    save_output: true,
  });

  const workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {
    "1": { class_type: load, inputs: loadInputs },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: opts.ckpt } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: opts.prompt, clip: ["4", 1] } },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: opts.negativePrompt || "", clip: ["4", 1] },
    },
    "10": { class_type: "VAEEncode", inputs: { pixels: ["1", 0], vae: ["4", 2] } },
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
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: combine, inputs: combineInputs },
  };

  if (opts.probe.animateDiffNode) {
    const motion = pickCombo(opts.objectInfo, opts.probe.animateDiffNode, "model_name", [
      "mm_sd",
      "v15",
      "v3",
    ]) || pickCombo(opts.objectInfo, opts.probe.animateDiffNode, "motion_model", ["mm_sd"]);
    const adeInputs = fillNodeWidgets(opts.objectInfo, opts.probe.animateDiffNode, {
      model: ["4", 0],
      model_name: motion,
      motion_model: motion,
    });
    const required = Object.keys(
      (opts.objectInfo[opts.probe.animateDiffNode] as { input?: { required?: Record<string, unknown> } })
        ?.input?.required || {}
    );
    const needsOnlyModel = required.every((k) =>
      ["model", "model_name", "motion_model", "beta_schedule", "motion_scale"].includes(k)
    );
    if (needsOnlyModel || (adeInputs.model && (adeInputs.model_name || adeInputs.motion_model))) {
      workflow["20"] = { class_type: opts.probe.animateDiffNode, inputs: adeInputs };
      (workflow["3"].inputs as Record<string, unknown>).model = ["20", 0];
    }
  }

  return workflow;
}

export async function generatePrivateVideo(opts: {
  prompt: string;
  video?: unknown;
  image?: unknown;
  size?: string;
  strength?: number;
  seed?: number;
  steps?: number;
  negativePrompt?: string;
  extraUrls?: string[];
}): Promise<{
  video: { b64: string; mime: string };
  endpoint: { url: string; kind: string; checkpoint?: string };
  probe: ComfyVideoProbe;
}> {
  const media = resolveVideoMedia(opts.video) || resolveVideoMedia(opts.image);
  if (!media) {
    throw new Error("video is required for v2v");
  }

  const endpoint = await discoverPrivateImageEndpoint(opts.extraUrls || []);
  if (!endpoint) throw offlineError();
  if (endpoint.kind !== "comfy" || !comfyAdapterEnabled()) {
    throw offlineError();
  }

  const healthy =
    (await fetchOk(`${endpoint.url}/system_stats`, 4000)) ||
    (await fetchOk(`${endpoint.url}/object_info`, 8000));
  if (!healthy) throw offlineError();

  const objectInfo = await fetchComfyObjectInfo(endpoint.url);
  const probe = probeVideoNodes(objectInfo);
  if (!probe.ready || !objectInfo) {
    const extra =
      probe.wanNodes.length > 0
        ? ` Wan nodes found (${probe.wanNodes.join(", ")}) but no supported v2v graph (need LoadVideo + VideoCombine).`
        : "";
    throw new PrivateVideoUnavailableError(
      probe.missingNodes,
      `${COMFY_VIDEO_NODES_MISSING}.${extra}`
    );
  }

  const ckpt = await resolveComfyCheckpoint(endpoint.url);
  const { width, height } = parseSize(opts.size || "1280x720");
  const uploaded = await uploadComfyInput(endpoint.url, media, "video");
  const workflow = buildVhsV2vWorkflow({
    objectInfo,
    probe,
    ckpt,
    videoName: uploaded.name,
    prompt: opts.prompt,
    negativePrompt: opts.negativePrompt,
    width,
    height,
    strength: opts.strength ?? 0.65,
    seed: opts.seed,
    steps: opts.steps,
  });

  try {
    const ran = await runComfyPrompt(endpoint.url, workflow, {
      waitFor: "video",
      timeoutMs: 600_000,
    });
    const first = ran.videos[0];
    if (!first) throw offlineError();
    const file = await viewComfyFile(endpoint.url, first);
    return {
      video: file,
      endpoint: { url: endpoint.url, kind: endpoint.kind, checkpoint: ckpt },
      probe,
    };
  } catch (err) {
    if (isConnectFail(err)) throw offlineError();
    throw err;
  }
}
