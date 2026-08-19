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
      spendLimitUsdCents?: number | null;
      spendUsedUsdCents?: number | null;
      allowedModels?: unknown;
      lastUsedAt?: Date | null;
    };
    organization: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      creditsUsdCents?: number | null;
      welcomeCreditsUsdCents?: number | null;
      welcomeExpiresAt?: Date | null;
      sector?: string | null;
      dataResidency?: string | null;
      subscriptionStatus?: string | null;
      agentsAddonStatus?: string | null;
      webSearchAddonStatus?: string | null;
    };
    chatRequestBody?: {
      model?: string;
      messages?: Array<{ content?: unknown }>;
      max_tokens?: number;
      stream?: boolean;
      prompt?: string | string[];
      provider?: unknown;
      response_format?: unknown;
      service_tier?: "standard" | "priority";
      prompt_cache_key?: string;
      user?: string;
    };
    billingContext?: {
      plan: string;
      family: "closed" | "open_weight";
      providerSlug: string;
      useFromPlan: boolean;
      useFromCredits: boolean;
      estimatedCostUsd?: number;
      userId?: string | null;
    };
    skipBilling?: boolean;
    houseChat?: boolean;
    effectiveRateLimits?: { tpm: number; rpm: number };
    appAttribution?: { httpReferer?: string; xTitle?: string };
  }
}
