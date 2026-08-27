export const THIS_HOST_KEY = "this-host";

export const SHARED_METAL_DEFAULT_HOURLY_USD = 0.8;
export const SHARED_METAL_MIN_HOURLY_USD = 0.25;
export const SHARED_METAL_MAX_HOURLY_USD = 4;

/** Weak machines stay off the marketplace. 24 GB is the Apple Silicon floor. */
export const SHARE_MIN_APPLE_UNIFIED_GB = 24;
export const SHARE_MIN_DISCRETE_VRAM_GB = 16;

export type HostShareCapabilities = {
  appleSilicon: boolean;
  gpuName: string | null;
  chip: string | null;
  memoryGb: number | null;
  gpuMemoryGb: number | null;
  usableMemoryGb: number | null;
  ollamaInstalled: boolean;
  ollamaRunning: boolean;
  studioLive: boolean;
};

export type HostEligibility = {
  eligible: boolean;
  reasons: string[];
  hasAccelerator: boolean;
  memoryOk: boolean;
  workerUp: boolean;
  label: string;
  workerKind: "studio" | "ollama" | null;
};

export type UseVsShareLane = "self-use" | "share" | "shared-rental" | "opendoor";

export function useVsShareCopy(lane: UseVsShareLane) {
  if (lane === "opendoor") {
    return {
      title: "Rent from OpenDoor",
      sku: "GCP Cloud Run",
      verb: "Rent GPU",
      rateNote: "Listed rate · your GCP project",
    };
  }
  if (lane === "self-use") {
    return {
      title: "Use this Mac",
      sku: "Use this Mac (Metal)",
      verb: "Use this Mac",
      rateNote: "$0 — your hardware, for you",
    };
  }
  if (lane === "share") {
    return {
      title: "Share your GPU",
      sku: "Shared Metal",
      verb: "List this Mac",
      rateNote: "Listed $/hr — you earn",
    };
  }
  return {
    title: "Shared host",
    sku: "Shared Metal",
    verb: "Rent listed host",
    rateNote: "Listed host rate",
  };
}

export function evaluateHostShareEligibility(cap: HostShareCapabilities): HostEligibility {
  const hasApple = Boolean(cap.appleSilicon);
  const hasDiscrete = Boolean(cap.gpuName) && !hasApple;
  const hasAccelerator = hasApple || Boolean(cap.gpuName);
  const unified = cap.usableMemoryGb ?? cap.memoryGb;
  const vram = cap.gpuMemoryGb ?? cap.usableMemoryGb;

  let memoryOk = false;
  if (hasApple) memoryOk = (unified ?? 0) >= SHARE_MIN_APPLE_UNIFIED_GB;
  else if (hasDiscrete) memoryOk = (vram ?? 0) >= SHARE_MIN_DISCRETE_VRAM_GB;

  const workerUp = Boolean(cap.studioLive || cap.ollamaRunning);
  const workerKind: HostEligibility["workerKind"] = cap.studioLive
    ? "studio"
    : cap.ollamaRunning
      ? "ollama"
      : null;

  const reasons: string[] = [];
  if (!hasAccelerator) {
    reasons.push("No Apple Silicon or discrete GPU detected on this machine.");
  } else if (!memoryOk) {
    if (hasApple) {
      reasons.push(
        `This Mac has ${unified ?? "unknown"} GB unified memory — need at least ${SHARE_MIN_APPLE_UNIFIED_GB} GB to list.`,
      );
    } else {
      reasons.push(
        `Detected GPU is too small — need at least ${SHARE_MIN_DISCRETE_VRAM_GB} GB VRAM to list.`,
      );
    }
  }
  if (!workerUp) {
    reasons.push("Studio or Ollama must be up before others can run jobs on this host.");
  }

  const memLabel = hasApple ? unified : vram;
  const label = hasApple
    ? `Apple Silicon${memLabel != null ? ` · ${memLabel} GB` : ""}`
    : cap.gpuName
      ? `${cap.gpuName}${memLabel != null ? ` · ${memLabel} GB` : ""}`
      : "This host";

  return {
    eligible: hasAccelerator && memoryOk && workerUp,
    reasons,
    hasAccelerator,
    memoryOk,
    workerUp,
    label,
    workerKind,
  };
}

export function clampSharedHourlyUsd(value: number): number {
  if (!Number.isFinite(value)) return SHARED_METAL_DEFAULT_HOURLY_USD;
  const rounded = Math.round(value * 100) / 100;
  return Math.min(SHARED_METAL_MAX_HOURLY_USD, Math.max(SHARED_METAL_MIN_HOURLY_USD, rounded));
}

export function earningsCentsForElapsed(
  hourlyUsd: number,
  startedAt: Date | string,
  endedAt: Date | string,
): number {
  const start = typeof startedAt === "string" ? new Date(startedAt).getTime() : startedAt.getTime();
  const end = typeof endedAt === "string" ? new Date(endedAt).getTime() : endedAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(hourlyUsd) || hourlyUsd <= 0) {
    return 0;
  }
  const ms = Math.max(0, end - start);
  return Math.floor((ms / 3_600_000) * hourlyUsd * 100);
}

export function formatEarningsUsd(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}
