import { db, requests, providers } from "@opendoor/database";
import { eq } from "drizzle-orm";

export function appAttributionFromHeaders(
  header: (name: string) => string | undefined
): { httpReferer?: string; xTitle?: string } | undefined {
  const httpReferer = header("HTTP-Referer") || header("Referer");
  const xTitle = header("X-Title");
  if (!httpReferer && !xTitle) return undefined;
  return {
    ...(httpReferer ? { httpReferer } : {}),
    ...(xTitle ? { xTitle } : {}),
  };
}

export async function logGatewayRequest(opts: {
  apiKeyId: string;
  organizationId: string;
  providerSlug: string;
  modelId: string;
  requestType: "chat" | "embedding" | "image" | "rerank" | "completion";
  promptTokens: number;
  completionTokens?: number;
  latencyMs: number;
  costUsd: number;
  status?: "success" | "error";
  errorMessage?: string;
  region?: string;
  metadata?: Record<string, unknown>;
}) {
  let providerId: string | null = null;
  try {
    const rows = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.slug, opts.providerSlug))
      .limit(1);
    providerId = rows[0]?.id || null;
  } catch {
    /* ignore */
  }
  if (!providerId) return;
  try {
    await db.insert(requests).values({
      apiKeyId: opts.apiKeyId,
      organizationId: opts.organizationId,
      providerId,
      modelId: opts.modelId,
      requestType: opts.requestType,
      promptTokens: opts.promptTokens,
      completionTokens: opts.completionTokens || 0,
      totalTokens: opts.promptTokens + (opts.completionTokens || 0),
      latencyMs: opts.latencyMs,
      costUsd: opts.costUsd.toString(),
      status: opts.status || "success",
      errorMessage: opts.errorMessage,
      region: opts.region || process.env.GCP_REGION || process.env.AZURE_REGION || "global",
      metadata: opts.metadata || undefined,
    });
  } catch (e) {
    console.error("[request-log] insert failed", e);
  }
}
