import { isClosedApiModel } from "@/lib/gcp/hf-repo";
import { isProviderConfigured } from "@/lib/models/ready";
import { OLLAMA_MODEL_MAP, resolveOllamaTag } from "@/lib/gpu/models";

export type GpuSku = "metal" | "nvidia-l4" | "nvidia-a100" | "nvidia-h100" | "hosted";

export type PerfClass = "fast" | "balanced" | "quality";

export type ModelRuntime = {
  sku: GpuSku;
  gpuLabel: string;
  available: boolean;
  reason: string;
  paramB: number | null;
  tokPerSec: number | null;
  ttftMs: number | null;
  perfClass: PerfClass;
};

const GPU_LABEL: Record<GpuSku, string> = {
  metal: "This Mac · Metal",
  "nvidia-l4": "Google Cloud · NVIDIA L4",
  "nvidia-a100": "Google Cloud · NVIDIA A100",
  "nvidia-h100": "Google Cloud · NVIDIA H100",
  hosted: "Hosted API · no GPU bill",
};

function inferParamB(modelId: string, label = ""): number | null {
  const s = `${modelId} ${label}`;
  const m = s.match(/(\d+(?:\.\d+)?)\s*[bB]\b/);
  if (m) return Number(m[1]);
  const lower = s.toLowerCase();
  if (/codestral/.test(lower)) return 22;
  if (/haiku|flash|mini|turbo|3b|tiny/.test(lower)) return 3;
  if (/gpt-4o(?!-mini)|sonnet|mistral-small|gemini-1\.5-pro/.test(lower)) return 70;
  if (/opus|mistral-large|gpt-4(?!o)/.test(lower)) return 200;
  return null;
}

function localTagMatch(modelId: string, ollamaTag: string | null | undefined, localModels: string[]): boolean {
  const tags = new Set(localModels.map((t) => t.toLowerCase()));
  const candidates = [
    modelId,
    resolveOllamaTag(modelId, ollamaTag),
    OLLAMA_MODEL_MAP[modelId],
    ollamaTag || "",
  ]
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  return candidates.some((c) => tags.has(c) || [...tags].some((t) => t === c || t.startsWith(`${c}:`) || c.startsWith(`${t}:`)));
}

function estimateOnGpu(sku: GpuSku, paramB: number | null): { tokPerSec: number | null; ttftMs: number | null; perfClass: PerfClass } {
  const p = paramB ?? (sku === "hosted" ? 70 : 8);
  if (sku === "metal") {
    if (p <= 4) return { tokPerSec: 42, ttftMs: 220, perfClass: "fast" };
    if (p <= 9) return { tokPerSec: 22, ttftMs: 380, perfClass: "balanced" };
    return { tokPerSec: 8, ttftMs: 900, perfClass: "quality" };
  }
  if (sku === "nvidia-l4") {
    if (p <= 8) return { tokPerSec: 55, ttftMs: 280, perfClass: "fast" };
    if (p <= 14) return { tokPerSec: 32, ttftMs: 450, perfClass: "balanced" };
    return { tokPerSec: 12, ttftMs: 900, perfClass: "quality" };
  }
  if (sku === "nvidia-a100") {
    if (p <= 14) return { tokPerSec: 90, ttftMs: 180, perfClass: "fast" };
    if (p <= 80) return { tokPerSec: 48, ttftMs: 320, perfClass: "balanced" };
    return { tokPerSec: 22, ttftMs: 600, perfClass: "quality" };
  }
  if (sku === "nvidia-h100") {
    if (p <= 14) return { tokPerSec: 140, ttftMs: 120, perfClass: "fast" };
    if (p <= 80) return { tokPerSec: 85, ttftMs: 200, perfClass: "balanced" };
    return { tokPerSec: 40, ttftMs: 380, perfClass: "quality" };
  }
  if (p <= 8) return { tokPerSec: 80, ttftMs: 250, perfClass: "fast" };
  if (p <= 80) return { tokPerSec: 45, ttftMs: 400, perfClass: "balanced" };
  return { tokPerSec: 28, ttftMs: 700, perfClass: "quality" };
}

export function resolveModelRuntime(opts: {
  modelId: string;
  label?: string;
  family?: string | null;
  source?: string | null;
  providerSlug?: string | null;
  ollamaTag?: string | null;
  deploymentGpu?: string | null;
  localModels: string[];
  metalReady: boolean;
  ollamaRunning: boolean;
  gcpReady: boolean;
}): ModelRuntime {
  const paramB = inferParamB(opts.modelId, opts.label);
  const onThisMac = localTagMatch(opts.modelId, opts.ollamaTag, opts.localModels);
  const openWeight = opts.family === "open_weight" || opts.source === "ollama" || opts.source === "huggingface";
  const closed = isClosedApiModel(opts.modelId) || opts.family === "closed";

  let sku: GpuSku = "hosted";
  if (opts.deploymentGpu === "metal" || onThisMac || (opts.source === "ollama" && opts.metalReady)) {
    sku = "metal";
  } else if (opts.deploymentGpu === "nvidia-h100") {
    sku = "nvidia-h100";
  } else if (opts.deploymentGpu === "nvidia-a100") {
    sku = "nvidia-a100";
  } else if (opts.deploymentGpu === "nvidia-l4" || (openWeight && !closed)) {
    sku = paramB != null && paramB >= 70 ? "nvidia-a100" : "nvidia-l4";
  } else if (closed) {
    sku = "hosted";
  }

  let available = false;
  let reason = "";
  if (sku === "metal") {
    available = opts.metalReady && (onThisMac || (opts.ollamaRunning && opts.source === "ollama"));
    reason = available ? "Running" : "Unavailable";
  } else if (sku === "nvidia-l4") {
    available = opts.gcpReady;
    reason = available ? "Available" : "Unavailable";
  } else if (sku === "nvidia-a100" || sku === "nvidia-h100") {
    available = false;
    reason = "Unavailable";
  } else {
    available = isProviderConfigured(opts.providerSlug);
    reason = available ? "Available" : "Unavailable";
  }

  const perf = estimateOnGpu(sku, paramB);
  return {
    sku,
    gpuLabel: GPU_LABEL[sku],
    available,
    reason,
    paramB,
    ...perf,
  };
}
