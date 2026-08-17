// @ts-nocheck
import { createRedis } from "./redis.js";

const redis = createRedis();

function emptyHealth(slug: string): HealthMetrics {
  return {
    slug,
    successRate: 1,
    avgLatencyMs: 0,
    successCount: 0,
    errorCount: 0,
    totalCalls: 0,
    lastSeenAt: null,
  };
}

const DEFAULT_WINDOW_MS = parseInt(process.env.ROUTER_HEALTH_WINDOW_MS || "300000", 10); // 5 min
const MAX_LATENCY_AGE_MS = parseInt(process.env.ROUTER_LATENCY_MAX_AGE_MS || "1800000", 10); // 30 min
const MAX_ENTRIES = 200;

function latencyKey(slug: string) {
  return `od:provider:latency:${slug}`;
}
function errorsKey(slug: string) {
  return `od:provider:errors:${slug}`;
}
function successesKey(slug: string) {
  return `od:provider:successes:${slug}`;
}
function lastSeenKey(slug: string) {
  return `od:provider:last-seen:${slug}`;
}

export async function recordSuccess(slug: string, latencyMs: number) {
  try {
    const now = Date.now();
    const rand = Math.random().toString(36).slice(2, 10);
    const pipeline = redis.pipeline();

    pipeline.zadd(latencyKey(slug), now, `${now}:${latencyMs}:${rand}`);
    pipeline.zremrangebyscore(latencyKey(slug), 0, now - MAX_LATENCY_AGE_MS);
    pipeline.zcard(latencyKey(slug));

    pipeline.zadd(successesKey(slug), now, `${now}:${rand}`);
    pipeline.zremrangebyscore(successesKey(slug), 0, now - DEFAULT_WINDOW_MS);

    pipeline.set(lastSeenKey(slug), now.toString(), "PX", MAX_LATENCY_AGE_MS);

    const results = await pipeline.exec();
    const count = results?.[2]?.[1] as number | undefined;
    if (count && count > MAX_ENTRIES) {
      await redis.zremrangebyrank(latencyKey(slug), 0, count - MAX_ENTRIES - 1);
    }
  } catch {
    /* redis optional */
  }
}

export async function recordError(slug: string, _error?: Error) {
  try {
    const now = Date.now();
    const rand = Math.random().toString(36).slice(2, 10);
    await redis.zadd(errorsKey(slug), now, `${now}:${rand}`);
    await redis.zremrangebyscore(errorsKey(slug), 0, now - DEFAULT_WINDOW_MS);
  } catch {
    /* redis optional */
  }
}

export interface HealthMetrics {
  slug: string;
  successRate: number;
  avgLatencyMs: number;
  successCount: number;
  errorCount: number;
  totalCalls: number;
  lastSeenAt: number | null;
}

export async function getHealthMetrics(
  slug: string,
  windowMs = DEFAULT_WINDOW_MS
): Promise<HealthMetrics> {
  try {
    const now = Date.now();
    const since = now - windowMs;

    const [latencyEntries, errorCountRaw, successCountRaw, lastSeenRaw] = await Promise.all([
      redis.zrangebyscore(latencyKey(slug), since, now),
      redis.zcount(errorsKey(slug), since, now),
      redis.zcount(successesKey(slug), since, now),
      redis.get(lastSeenKey(slug)),
    ]);

    let avgLatencyMs = 0;
    if (latencyEntries.length > 0) {
      const sum = latencyEntries.reduce((acc: number, entry: string) => {
        const parts = entry.split(":");
        return acc + (parseInt(parts[1], 10) || 0);
      }, 0);
      avgLatencyMs = Math.round(sum / latencyEntries.length);
    }

    const errorCount = (errorCountRaw as number) || 0;
    const successCount = (successCountRaw as number) || 0;
    const totalCalls = successCount + errorCount;
    const successRate = totalCalls > 0 ? successCount / totalCalls : 1.0;

    const lastSeenAt = lastSeenRaw ? parseInt(lastSeenRaw, 10) : null;

    return {
      slug,
      successRate,
      avgLatencyMs: avgLatencyMs || 5000,
      successCount,
      errorCount,
      totalCalls,
      lastSeenAt,
    };
  } catch {
    return emptyHealth(slug);
  }
}

export async function getAllHealthMetrics(
  slugs: string[],
  windowMs = DEFAULT_WINDOW_MS
): Promise<Map<string, HealthMetrics>> {
  const results = await Promise.all(slugs.map((s) => getHealthMetrics(s, windowMs)));
  const map = new Map<string, HealthMetrics>();
  for (const r of results) map.set(r.slug, r);
  return map;
}

export async function resetProviderMetrics(slug: string) {
  try {
    await redis.del(latencyKey(slug), errorsKey(slug), successesKey(slug), lastSeenKey(slug));
  } catch {
    /* redis optional */
  }
}
