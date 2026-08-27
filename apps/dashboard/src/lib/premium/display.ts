import { GPU_RATES } from "@opendoor/shared";

export type ExecutionMode = "on-demand" | "off-peak" | "batch";

export type ExecutionModeConfig = {
  id: ExecutionMode;
  label: string;
  badge: string;
  discountText: string;
  description: string;
  availabilityNote: string;
  sla: string;
};

export const EXECUTION_MODES: ExecutionModeConfig[] = [
  {
    id: "on-demand",
    label: "On-Demand Dedicated",
    badge: "Instant Real-Time",
    discountText: "Full Price",
    description:
      "Immediate dedicated GPU with no queue. GCP reserved replica stays warm; Use this Mac starts if Studio or Ollama is up.",
    availabilityNote: "Reserved replica · 100% dedicated VRAM while billed",
    sla: "Interactive · reserved Cloud Run or Use this Mac",
  },
  {
    id: "off-peak",
    label: "Off-Peak Scheduled",
    badge: "10 PM – 8 AM UK & Weekends",
    discountText: "Idle $0",
    description:
      "Low-demand window (10:00 PM – 8:00 AM UK time and weekends). GCP uses scale-to-zero: $0 idle, listed gpu_skus rate while warm.",
    availabilityNote: "Scale-to-zero · listed rate only while warm",
    sla: "Scheduled dedicated once provisioned",
  },
  {
    id: "batch",
    label: "Flexible Batch Queue",
    badge: "Async · scale-to-zero",
    discountText: "Idle $0",
    description:
      "Asynchronous bulk image and video jobs. Capacity is Cloud Run scale-to-zero — not a separate discounted meter.",
    availabilityNote: "Queue-friendly · $0 idle · listed rate while serving",
    sla: "Asynchronous batch (higher throughput, slower start)",
  },
];

export type SkuSpec = {
  classEquivalent: string;
  subtitle: string;
  vram: string;
  coreSpeed: string;
  bandwidth: string;
  recommendedFor: string;
  region: string;
  badge?: string;
  popular?: boolean;
  benchmarks: {
    fluxDev: string;
    imagen3: string;
    veoVideo: string;
  };
};

export const SKU_SPECS: Record<string, SkuSpec> = {
  metal: {
    classEquivalent: "Apple Silicon / Metal",
    subtitle: "Use this Mac · $0",
    vram: "Unified memory on this machine",
    coreSpeed: "Metal GPU on-device",
    bandwidth: "On-package unified memory",
    recommendedFor:
      "Local self-use on this machine — Use this Mac, not a rental from yourself. List it under Share your GPU if you want others to pay the listed Metal rate.",
    region: "This host",
    badge: "Local",
    benchmarks: {
      fluxDev: "Studio process",
      imagen3: "Not Vertex MaaS",
      veoVideo: "Load weights on-box",
    },
  },
  "nvidia-l4": {
    classEquivalent: "L4 24GB · Cloud Run",
    subtitle: "24GB Dedicated VRAM",
    vram: "24 GB High-Speed VRAM",
    coreSpeed: "120 TFLOPS Core Speed",
    bandwidth: "300 GB/s Memory Bandwidth",
    recommendedFor: "Fast SDXL, Flux Schnell 1024px, LoRA testing, and low-latency prototyping.",
    region: "GCP Cloud Run · listed rate · no extra region lock",
    badge: "Entry",
    benchmarks: {
      fluxDev: "2.1s / step (class)",
      imagen3: "Private GPU, not Imagen",
      veoVideo: "Standard queue",
    },
  },
  "nvidia-a100": {
    classEquivalent: "A100 80GB SXM4 Class",
    subtitle: "80GB High-Bandwidth VRAM",
    vram: "80 GB High-Bandwidth VRAM",
    coreSpeed: "312 TFLOPS Core Speed",
    bandwidth: "1,935 GB/s Memory Bandwidth",
    recommendedFor: "High-res Flux, multi-modal video synthesis, full-batch LoRA training.",
    region: "GCP Cloud Run · listed rate · no extra region lock",
    badge: "80GB VRAM",
    popular: true,
    benchmarks: {
      fluxDev: "0.48s / step (class)",
      imagen3: "Private GPU, not Imagen",
      veoVideo: "3.8s (1080p class)",
    },
  },
  "nvidia-h100": {
    classEquivalent: "H100 80GB SXM5 Class",
    subtitle: "80GB Ultra-Bandwidth VRAM",
    vram: "80 GB Ultra-Bandwidth VRAM",
    coreSpeed: "750 TFLOPS Core Speed",
    bandwidth: "3,350 GB/s Memory Bandwidth",
    recommendedFor: "Cinematic video generation, 4K pipelines, LLM fine-tuning.",
    region: "GCP Cloud Run · list includes 1.25× region factor in gpu_skus",
    badge: "Ultra Fast",
    benchmarks: {
      fluxDev: "0.19s / step (class)",
      imagen3: "Private GPU, not Imagen",
      veoVideo: "1.9s (1080p class)",
    },
  },
};

export const ENTERPRISE_CLUSTER_SKU = "enterprise-h100-cluster";

export const ENTERPRISE_SPEC: SkuSpec = {
  classEquivalent: "8× H100 640GB Cluster",
  subtitle: "640GB Clustered VRAM",
  vram: "640 GB Clustered VRAM",
  coreSpeed: "6,000 TFLOPS Cluster Compute",
  bandwidth: "3.2 Tbps Ultra Interconnect",
  recommendedFor: "Production-scale video pipelines and high-concurrency Studio endpoints. Not a self-serve Cloud Run SKU.",
  region: "Quoted region · talk to us",
  badge: "Contact",
  benchmarks: {
    fluxDev: "Custom quote",
    imagen3: "Custom quote",
    veoVideo: "Custom quote",
  },
};

export const CLASS_COMPARISON = [
  { cls: "RTX 4090 / A10G", note: "Shown on the last hub as Pro. Not a Cloud Run SKU here — use L4 or attach a running box." },
  { cls: "8× H100 cluster", note: "Enterprise comparison only. Open Support — Premium will not invent a cluster rental." },
] as const;

export type ApiSku = {
  sku: string;
  displayName: string;
  hourlyUsd: number;
  target: "local" | "gcp";
  regionMultiplier?: number;
};

export type DisplaySku = ApiSku &
  SkuSpec & {
    rentable: boolean;
    regionMultiplier: number;
  };

const FALLBACK_SPEC: SkuSpec = {
  classEquivalent: "Dedicated GPU",
  subtitle: "Catalog SKU",
  vram: "See gpu_skus",
  coreSpeed: "Cloud Run GPU",
  bandwidth: "Provider default",
  recommendedFor: "Private image and chat weights on a dedicated box.",
  region: "GCP Cloud Run",
  benchmarks: {
    fluxDev: "Depends on SKU",
    imagen3: "Private GPU, not Imagen",
    veoVideo: "Depends on SKU",
  },
};

export function specForSku(sku: string): SkuSpec {
  if (sku === ENTERPRISE_CLUSTER_SKU) return ENTERPRISE_SPEC;
  return SKU_SPECS[sku] || FALLBACK_SPEC;
}

const METAL_SKU: ApiSku = {
  sku: "metal",
  displayName: "Use this Mac (Metal)",
  hourlyUsd: 0,
  target: "local",
  regionMultiplier: 1,
};

/** Listed OpenDoor Cloud Run SKUs — always priced from GPU_RATES when gpu_skus is empty. */
export function listedOpenDoorSkus(): ApiSku[] {
  return Object.values(GPU_RATES).map((g) => ({
    sku: g.sku,
    displayName: g.displayName,
    hourlyUsd: g.listHourlyUsd,
    target: "gcp" as const,
    regionMultiplier: g.regionMultiplier,
  }));
}

export function catalogPremiumSkus(apiSkus: ApiSku[] = []): ApiSku[] {
  const incoming = apiSkus.filter((s) => s.sku !== ENTERPRISE_CLUSTER_SKU);
  const metal = incoming.find((s) => s.sku === "metal" || s.target === "local") || METAL_SKU;
  const cloud = incoming.filter((s) => s.sku !== metal.sku && s.target !== "local");
  const bySku = new Map(cloud.map((row) => [row.sku, row]));
  for (const listed of listedOpenDoorSkus()) {
    if (!bySku.has(listed.sku)) bySku.set(listed.sku, listed);
  }
  const ordered = [...bySku.values()].sort((a, b) => {
    const orderA = GPU_RATES[a.sku as keyof typeof GPU_RATES]?.sortOrder ?? 100;
    const orderB = GPU_RATES[b.sku as keyof typeof GPU_RATES]?.sortOrder ?? 100;
    return orderA - orderB;
  });
  return [metal, ...ordered];
}

export function displaySkus(apiSkus: ApiSku[]): DisplaySku[] {
  const rows: DisplaySku[] = catalogPremiumSkus(apiSkus).map((s) => {
    const spec = specForSku(s.sku);
    return {
      ...spec,
      ...s,
      regionMultiplier: s.regionMultiplier ?? (s.sku === "nvidia-h100" ? 1.25 : 1),
      rentable: true,
    };
  });
  if (!rows.some((r) => r.sku === ENTERPRISE_CLUSTER_SKU)) {
    rows.push({
      sku: ENTERPRISE_CLUSTER_SKU,
      displayName: "Enterprise GPUs",
      hourlyUsd: 0,
      target: "gcp",
      regionMultiplier: 1,
      rentable: false,
      ...ENTERPRISE_SPEC,
    });
  }
  return rows;
}

export function modeToProvision(mode: ExecutionMode): { reserved: boolean; scaleToZero: boolean } {
  if (mode === "on-demand") return { reserved: true, scaleToZero: false };
  return { reserved: false, scaleToZero: true };
}

/** Capacity-window guides from listed rate — not a separate billed meter. */
export function capacityGuideRates(listHourlyUsd: number) {
  return {
    onDemand: listHourlyUsd,
    offPeak: Number((listHourlyUsd * 0.6).toFixed(2)),
    batch: Number((listHourlyUsd * 0.4).toFixed(2)),
  };
}

export function rentalHoursLeft(opts: {
  hours: number | null;
  startedAt: string | Date | null;
  status: string;
  now?: number;
}): { label: string; remainingMs: number | null } {
  if (opts.status === "stopped" || opts.status === "failed") {
    return { label: opts.status === "failed" ? "Failed" : "Stopped", remainingMs: 0 };
  }
  if (!opts.hours) return { label: "Until you stop", remainingMs: null };
  if (!opts.startedAt) {
    return { label: `${opts.hours}h reserved`, remainingMs: opts.hours * 3600_000 };
  }
  const start = typeof opts.startedAt === "string" ? new Date(opts.startedAt).getTime() : opts.startedAt.getTime();
  const remainingMs = start + opts.hours * 3600_000 - (opts.now ?? Date.now());
  if (remainingMs <= 0) return { label: "Time up", remainingMs: 0 };
  const h = Math.floor(remainingMs / 3600_000);
  const m = Math.floor((remainingMs % 3600_000) / 60_000);
  return { label: h > 0 ? `${h}h ${m}m left` : `${m}m left`, remainingMs };
}

export type PremiumHubLane = "use" | "share";
export type PremiumProduct = "opendoor" | "self-use" | "share";

export function defaultRentFromUsSku(
  skus: Array<{ sku: string; target: "local" | "gcp"; rentable?: boolean }>,
): string {
  const gcp = skus.find(
    (s) => s.target === "gcp" && s.rentable !== false && s.sku !== ENTERPRISE_CLUSTER_SKU,
  );
  return gcp?.sku || "nvidia-l4";
}

export function premiumProductFromSelection(opts: {
  hub: PremiumHubLane;
  sku?: string;
  target?: "local" | "gcp";
}): PremiumProduct {
  if (opts.hub === "share") return "share";
  if (opts.target === "local" || opts.sku === "metal" || opts.sku === "none") return "self-use";
  return "opendoor";
}

export function shortGpuLabel(sku: string, displayName?: string): string {
  if (sku === "nvidia-l4") return "L4";
  if (sku === "nvidia-a100") return "A100";
  if (sku === "nvidia-h100") return "H100";
  if (sku === ENTERPRISE_CLUSTER_SKU) return "Enterprise";
  if (sku === "metal" || sku === "none") return "this Mac";
  const stripped = (displayName || sku).replace(/^NVIDIA\s+/i, "").trim();
  return stripped || sku;
}

export function rentFromUsCta(opts: {
  sku: string;
  displayName?: string;
  rentable?: boolean;
  hours?: number | null;
  executionMode?: ExecutionMode;
}): string {
  if (opts.sku === ENTERPRISE_CLUSTER_SKU || opts.rentable === false) return "Talk to Support";
  const short = shortGpuLabel(opts.sku, opts.displayName);
  if (opts.executionMode === "batch") {
    return opts.hours ? `Submit ${short} (${opts.hours}h)` : `Submit ${short}`;
  }
  return opts.hours ? `Rent ${short} (${opts.hours}h)` : `Rent ${short}`;
}

export function provisionLabel(
  deployment: {
    reserved?: boolean | null;
    scaleToZero?: boolean | null;
    target?: string | null;
    hostShareId?: string | null;
  } | null,
) {
  if (!deployment) return null;
  if (deployment.hostShareId) return "Shared host";
  if (deployment.target === "local") return "Use this Mac";
  if (deployment.reserved) return "On-demand reserved";
  if (deployment.scaleToZero) return "Scale-to-zero";
  return deployment.target || null;
}
