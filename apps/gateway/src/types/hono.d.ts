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
      messages?: Array<{ content?: string }>;
      max_tokens?: number;
      stream?: boolean;
    };
    billingContext?: {
      plan: "free" | "pro" | "enterprise";
      family: "closed" | "open_weight";
      providerSlug: string;
      useFromPlan: boolean;
      useFromCredits: boolean;
      estimatedCostUsd?: number;
    };
  }
}
