// @ts-nocheck
import { Hono } from "hono";
import { db, requests } from "@opendoor/database";
import { eq, and, gte, sql } from "drizzle-orm";
import { DuckDBAnalyticsClient, getUsageDaily, getUsageTotals } from "@opendoor/analytics";
import { resolveRateLimits } from "../lib/spend-tiers.js";
import { createRedis } from "../lib/redis.js";

const redis = createRedis();

const usageRouter = new Hono();

usageRouter.get("/", async (c) => {
  const organization = c.get("organization");
  const days = parseInt(c.req.query("days") || "30", 10);
  const engine = c.req.query("engine");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // ── DuckDB-enhanced path ─────────────────────────────────────────────────
  if (engine === "duckdb") {
    const client = new DuckDBAnalyticsClient();
    if (!client.isEnabled()) {
      return c.json({ error: "DuckDB analytics not enabled" }, 503);
    }

    try {
      await client.init();
      const [daily, totals] = await Promise.all([
        getUsageDaily(client, {
          organizationId: organization.id,
          dateFrom: since,
        }),
        getUsageTotals(client, {
          organizationId: organization.id,
          dateFrom: since,
        }),
      ]);

      return c.json({
        days,
        daily,
        totals,
        engine: "duckdb",
      });
    } catch (err) {
      console.error("[DuckDB] Usage query failed, falling back to PostgreSQL:", err);
      // Fall through to default Drizzle path
    }
  }

  // ── Default Drizzle path ──────────────────────────────────────────────────
  const daily = await db
    .select({
      date: sql<string>`DATE(${requests.createdAt})`,
      requests: sql<number>`COUNT(*)`,
      promptTokens: sql<number>`SUM(${requests.promptTokens})`,
      completionTokens: sql<number>`SUM(${requests.completionTokens})`,
      totalTokens: sql<number>`SUM(${requests.totalTokens})`,
      costUsd: sql<number>`SUM(${requests.costUsd})`,
    })
    .from(requests)
    .where(
      and(
        eq(requests.organizationId, organization.id),
        gte(requests.createdAt, since)
      )
    )
    .groupBy(sql`DATE(${requests.createdAt})`)
    .orderBy(sql`DATE(${requests.createdAt})`);

  const totals = await db
    .select({
      totalRequests: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`SUM(${requests.totalTokens})`,
      totalCost: sql<number>`SUM(${requests.costUsd})`,
    })
    .from(requests)
    .where(
      and(
        eq(requests.organizationId, organization.id),
        gte(requests.createdAt, since)
      )
    );

  return c.json({
    days,
    daily,
    totals: totals[0],
  });
});

usageRouter.get("/rate-limits", async (c) => {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const keyPrefix = apiKey.keyPrefix;
  const limits = resolveRateLimits({
    spendUsedUsdCents: Number((apiKey as any).spendUsedUsdCents || 0),
    plan: organization?.plan || "free",
    keyTpm: apiKey.rateLimitTpm,
    keyRpm: apiKey.rateLimitRpm,
    serviceTier: "standard",
  });
  const priority = resolveRateLimits({
    spendUsedUsdCents: Number((apiKey as any).spendUsedUsdCents || 0),
    plan: organization?.plan || "free",
    keyTpm: apiKey.rateLimitTpm,
    keyRpm: apiKey.rateLimitRpm,
    serviceTier: "priority",
  });
  const rpm = limits.rpm;
  const tpm = limits.tpm;

  const minuteKey = `ratelimit:${keyPrefix}:minute`;
  const tokenKey = `ratelimit:${keyPrefix}:tokens`;

  const usedRpm = parseInt((await redis.get(minuteKey)) || "0", 10);
  const usedTpm = parseInt((await redis.get(tokenKey)) || "0", 10);

  const ttlMinute = await redis.ttl(minuteKey);
  const ttlTokens = await redis.ttl(tokenKey);

  return c.json({
    rpm: {
      limit: rpm,
      used: usedRpm,
      remaining: Math.max(0, rpm - usedRpm),
    },
    tpm: {
      limit: tpm,
      used: usedTpm,
      remaining: Math.max(0, tpm - usedTpm),
    },
    priority: { rpm: priority.rpm, tpm: priority.tpm },
    spendUnlockTierCents: limits.unlockTierCents,
    spendUsedUsdCents: Number((apiKey as any).spendUsedUsdCents || 0),
    resetAt: new Date(Date.now() + Math.max(ttlMinute, ttlTokens, 60) * 1000).toISOString(),
  });
});

export default usageRouter;
