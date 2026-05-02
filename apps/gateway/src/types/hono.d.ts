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
    };
  }
}
