import { Hono } from "hono";
import { db, requests } from "@opendoor/database";
import { eq, and, gte, sql } from "drizzle-orm";

const usageRouter = new Hono();

usageRouter.get("/", async (c) => {
  const organization = c.get("organization");
  const days = parseInt(c.req.query("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

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

export default usageRouter;
