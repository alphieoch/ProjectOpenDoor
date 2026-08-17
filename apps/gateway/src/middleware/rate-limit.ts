import type { Context, Next } from "hono";
import { getPlan } from "@opendoor/shared";
import { resolveRateLimits } from "../lib/spend-tiers.js";
import {
  admitServiceTier,
  normalizeServiceTier,
  trackInflight,
  type ServiceTier,
} from "../lib/service-tier.js";
import { createRedis } from "../lib/redis.js";

/** In-memory fallback when Memorystore is unreachable (e.g. Firebase project without VPC). */
const memMinute = new Map<string, { n: number; exp: number }>();
const memTokens = new Map<string, { n: number; exp: number }>();

const redis = createRedis();
let redisOk = false;
redis.on("ready", () => {
  redisOk = true;
});
redis.on("error", () => {
  redisOk = false;
});
setTimeout(() => {
  if (!redisOk) console.warn("Redis unavailable — using in-memory rate limits");
}, 2500);

async function incrMinute(key: string): Promise<number> {
  if (redisOk && redis) {
    try {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 60);
      return n;
    } catch {
      redisOk = false;
    }
  }
  const now = Date.now();
  const cur = memMinute.get(key);
  if (!cur || cur.exp < now) {
    memMinute.set(key, { n: 1, exp: now + 60_000 });
    return 1;
  }
  cur.n += 1;
  return cur.n;
}

async function getTokens(key: string): Promise<number> {
  if (redisOk && redis) {
    try {
      return parseInt((await redis.get(key)) || "0", 10);
    } catch {
      redisOk = false;
    }
  }
  const now = Date.now();
  const cur = memTokens.get(key);
  if (!cur || cur.exp < now) return 0;
  return cur.n;
}

export async function rateLimitMiddleware(c: Context, next: Next) {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");

  if (!apiKey) {
    return c.json({ error: "API key required for rate limiting" }, 401);
  }

  let serviceTier: ServiceTier = "standard";
  const body = c.get("chatRequestBody") as { service_tier?: unknown } | undefined;
  if (body?.service_tier != null) {
    serviceTier = normalizeServiceTier(body.service_tier);
  } else {
    const headerTier = c.req.header("x-opendoor-service-tier");
    if (headerTier) serviceTier = normalizeServiceTier(headerTier);
  }
  const plan = getPlan(organization?.plan);
  if (serviceTier === "priority" && !plan.priorityQueue) {
    return c.json(
      {
        error: "Priority queue requires Pro, Team, or Enterprise",
        service_tier: "standard",
        type: "plan_required",
      },
      403
    );
  }
  c.set("serviceTier", serviceTier);

  const admission = await admitServiceTier(serviceTier);
  if (!admission.ok) {
    return c.json(
      {
        error: admission.reason,
        service_tier: serviceTier,
        type: "capacity_exceeded",
      },
      503
    );
  }

  const limits = resolveRateLimits({
    spendUsedUsdCents: Number((apiKey as any).spendUsedUsdCents || 0),
    plan: organization?.plan || "free",
    keyTpm: apiKey.rateLimitTpm,
    keyRpm: apiKey.rateLimitRpm,
    serviceTier,
  });

  c.set("effectiveRateLimits", { tpm: limits.tpm, rpm: limits.rpm });

  const rpm = limits.rpm;
  const tpm = limits.tpm;
  const keyPrefix = apiKey.keyPrefix;

  const minuteKey = `ratelimit:${keyPrefix}:minute`;
  const tokenKey = `ratelimit:${keyPrefix}:tokens`;

  const currentMinute = await incrMinute(minuteKey);
  if (currentMinute > rpm) {
    return c.json(
      {
        error: "Rate limit exceeded: too many requests per minute",
        limit: rpm,
        service_tier: serviceTier,
      },
      429
    );
  }

  const currentTokens = await getTokens(tokenKey);
  if (currentTokens > tpm) {
    return c.json(
      {
        error: "Rate limit exceeded: token quota exceeded",
        limit: tpm,
        unlock_hint:
          "TPM unlocks automatically as lifetime spend on this key grows ($10 / $100 / $1k / $10k).",
      },
      429
    );
  }

  await trackInflight(1);
  try {
    await next();
  } finally {
    await trackInflight(-1);
  }
}

export async function recordTokens(keyPrefix: string, tokens: number) {
  const tokenKey = `ratelimit:${keyPrefix}:tokens`;
  if (redisOk && redis) {
    try {
      const current = await redis.incrby(tokenKey, tokens);
      if (current === tokens) await redis.expire(tokenKey, 60);
      return;
    } catch {
      redisOk = false;
    }
  }
  const now = Date.now();
  const cur = memTokens.get(tokenKey);
  if (!cur || cur.exp < now) {
    memTokens.set(tokenKey, { n: tokens, exp: now + 60_000 });
  } else {
    cur.n += tokens;
  }
}
