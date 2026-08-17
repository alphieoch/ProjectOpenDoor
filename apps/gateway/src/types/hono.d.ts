import type { Hono } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    apiKey: {
      id: string;
      name: string;
      keyPrefix: string;
      organizationId: string;
      rateLimitRpm: number | null;
      rateLimitTpm: number | null;
      spendUsedUsdCents?: number | null;
      allowedModels?: unknown;
    };
    organization: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      creditsUsdCents?: number | null;
    };
    chatRequestBody?: {
      model?: string;
      messages?: Array<{ content?: unknown }>;
      max_tokens?: number;
      stream?: boolean;
      prompt?: string | string[];
      response_format?: unknown;
      service_tier?: "standard" | "priority";
      prompt_cache_key?: string;
      user?: string;
    };
    billingContext?: {
      plan: "free" | "pro" | "team" | "enterprise";
      family: "closed" | "open_weight";
      providerSlug: string;
      useFromPlan: boolean;
      useFromCredits: boolean;
      estimatedCostUsd?: number;
    };
    serviceTier?: "standard" | "priority";
    effectiveRateLimits?: { tpm: number; rpm: number };
  }
}
