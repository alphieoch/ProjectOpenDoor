import type { GpuStatus } from "./detect";
import { OLLAMA_MODEL_MAP, resolveOllamaTag } from "./models";

export type DeviceSupportVerdict = "installed" | "supported" | "tight" | "unsupported" | "api_only";

export type DeviceSupportResult = {
  verdict: DeviceSupportVerdict;
  title: string;
  detail: string;
  local: boolean;
  hosted: boolean;
  installed: boolean;
  minMemoryGb: number;
  usableMemoryGb: number | null;
  deviceLabel: string;
  ollamaTag: string | null;
};

const KNOWN_PARAM_B: Record<string, number> = {
  "codestral-latest": 22,
  codestral: 22,
  "mistral-small-latest": 22,
  "mistral-large-latest": 123,
};

function inferParamB(modelId: string, label = ""): number | null {
  const known = KNOWN_PARAM_B[modelId.toLowerCase()];
  if (known) return known;
  const s = `${modelId} ${label}`;
  const m = s.match(/(\d+(?:\.\d+)?)\s*[bB]\b/);
  if (m) return Number(m[1]);
  if (/codestral/i.test(s)) return 22;
  return null;
}

export function inferMinMemoryGb(opts: {
  modelId: string;
  label?: string;
  catalogMinGb?: number | null;
}): number {
  if (opts.catalogMinGb && opts.catalogMinGb > 0) return opts.catalogMinGb;
  const paramB = inferParamB(opts.modelId, opts.label);
  if (paramB == null) return 8;
  if (paramB <= 3) return 4;
  if (paramB <= 9) return 8;
  if (paramB <= 14) return 12;
  if (paramB <= 24) return 16;
  if (paramB <= 34) return 24;
  if (paramB <= 70) return 48;
  return 80;
}

function modelBase(name: string): string {
  return name.toLowerCase().split(":")[0].replace(/-latest$/, "");
}

function localTagMatch(modelId: string, ollamaTag: string | null | undefined, localModels: string[]): boolean {
  const installed = new Set(localModels.map(modelBase));
  const candidates = [
    modelId,
    resolveOllamaTag(modelId, ollamaTag),
    OLLAMA_MODEL_MAP[modelId],
    ollamaTag || "",
  ].filter(Boolean);
  return candidates.some((c) => installed.has(modelBase(c)));
}

function deviceLabel(status: GpuStatus): string {
  const hw = status.local.hardware;
  const chip = hw.chip || (status.local.appleSilicon ? "Apple Silicon" : status.local.platform);
  const mem = hw.usableMemoryGb != null ? `${hw.usableMemoryGb} GB` : null;
  return mem ? `${chip} · ${mem}` : chip;
}

export function assessDeviceSupport(opts: {
  status: GpuStatus;
  modelId: string;
  label?: string;
  family?: string | null;
  source?: string | null;
  serverless?: boolean | null;
  ollamaTag?: string | null;
  catalogMinGb?: number | null;
}): DeviceSupportResult {
  const minMemoryGb = inferMinMemoryGb({
    modelId: opts.modelId,
    label: opts.label,
    catalogMinGb: opts.catalogMinGb,
  });
  const usable = opts.status.local.hardware.usableMemoryGb;
  const installed = localTagMatch(opts.modelId, opts.ollamaTag, opts.status.local.models);
  const openWeight =
    opts.family === "open_weight" || opts.source === "ollama" || opts.source === "huggingface";
  const hosted = Boolean(opts.serverless) || opts.source === "provider_api";
  const hasLocalAccel = opts.status.local.appleSilicon || Boolean(opts.status.local.hardware.gpuName);
  const label = deviceLabel(opts.status);
  const ollamaTag = opts.ollamaTag || OLLAMA_MODEL_MAP[opts.modelId] || null;

  if (!openWeight && hosted) {
    return {
      verdict: "api_only",
      title: "Hosted API — this device is not required",
      detail: `${opts.label || opts.modelId} runs through OpenDoor. Your Mac does not need to load the weights.`,
      local: false,
      hosted: true,
      installed: false,
      minMemoryGb,
      usableMemoryGb: usable,
      deviceLabel: label,
      ollamaTag,
    };
  }

  if (installed) {
    return {
      verdict: "installed",
      title: "Already on this device",
      detail: `${label} has the weights via Ollama. You can run it locally without a cloud GPU.`,
      local: true,
      hosted,
      installed: true,
      minMemoryGb,
      usableMemoryGb: usable,
      deviceLabel: label,
      ollamaTag,
    };
  }

  if (!hasLocalAccel) {
    return {
      verdict: hosted ? "api_only" : "unsupported",
      title: hosted ? "Call it serverless — this Mac is CPU only" : "This device cannot run it locally",
      detail: hosted
        ? `No Metal or NVIDIA GPU detected. You can still call ${opts.label || opts.modelId} through OpenDoor without a GPU request.`
        : `Need Apple Silicon or an NVIDIA GPU and about ${minMemoryGb} GB to run this locally.`,
      local: false,
      hosted,
      installed: false,
      minMemoryGb,
      usableMemoryGb: usable,
      deviceLabel: label,
      ollamaTag,
    };
  }

  if (usable != null && usable < Math.ceil(minMemoryGb * 0.75)) {
    return {
      verdict: hosted ? "api_only" : "unsupported",
      title: "Not enough memory on this device",
      detail: `${label} is below the ~${minMemoryGb} GB needed for a local run.${
        hosted ? " You can still call it serverless — no GPU request." : ""
      }`,
      local: false,
      hosted,
      installed: false,
      minMemoryGb,
      usableMemoryGb: usable,
      deviceLabel: label,
      ollamaTag,
    };
  }

  if (usable != null && usable < minMemoryGb) {
    return {
      verdict: "tight",
      title: "Tight fit on this device",
      detail: `${label} can try a quantized local run (needs ~${minMemoryGb} GB). Expect swap or a smaller quant.${
        hosted ? " Serverless is the safer path." : ""
      }`,
      local: true,
      hosted,
      installed: false,
      minMemoryGb,
      usableMemoryGb: usable,
      deviceLabel: label,
      ollamaTag,
    };
  }

  return {
    verdict: "supported",
    title: "This device can run it",
    detail: `${label} has enough ${
      opts.status.local.appleSilicon ? "unified memory" : "GPU memory"
    } (~${minMemoryGb} GB) for a local Ollama run.${
      hosted ? " You can also call it serverless without a GPU request." : ""
    }`,
    local: true,
    hosted,
    installed: false,
    minMemoryGb,
    usableMemoryGb: usable,
    deviceLabel: label,
    ollamaTag,
  };
}
