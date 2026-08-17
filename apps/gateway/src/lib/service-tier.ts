import Redis from "ioredis";

const redis = new (Redis as any)(process.env.REDIS_URL || "redis://localhost:6379");

export type ServiceTier = "standard" | "priority";

export function normalizeServiceTier(raw: unknown): ServiceTier {
  if (typeof raw === "string") {
    const v = raw.toLowerCase();
    if (v === "priority") return "priority";
  }
  return "standard";
}

/**
 * Shed Standard traffic when concurrent in-flight requests exceed threshold.
 * Priority always admitted. Enable with GATEWAY_SHED_STANDARD=1.
 */
export async function admitServiceTier(tier: ServiceTier): Promise<{
  ok: boolean;
  reason?: string;
  inFlight: number;
}> {
  const shed = process.env.GATEWAY_SHED_STANDARD === "1";
  const maxStandard = Number(process.env.GATEWAY_MAX_STANDARD_INFLIGHT || 80);

  let inFlight = 0;
  try {
    inFlight = Number(await redis.get("gateway:inflight") || 0);
  } catch {
    return { ok: true, inFlight: 0 };
  }

  if (tier === "priority") return { ok: true, inFlight };
  if (!shed) return { ok: true, inFlight };
  if (inFlight >= maxStandard) {
    return {
      ok: false,
      inFlight,
      reason:
        "Standard tier capacity exceeded. Retry with service_tier=priority or back off.",
    };
  }
  return { ok: true, inFlight };
}

export async function trackInflight(delta: number): Promise<void> {
  try {
    const n = await redis.incrby("gateway:inflight", delta);
    if (n < 0) await redis.set("gateway:inflight", "0");
    if (delta > 0) await redis.expire("gateway:inflight", 120);
  } catch {
    /* ignore */
  }
}
