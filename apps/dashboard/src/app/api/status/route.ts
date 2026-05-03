import { NextResponse } from "next/server";

interface ProviderStatus {
  name: string;
  slug: string;
  status: "up" | "down" | "unknown";
  latencyMs: number | null;
}

const PROVIDERS = [
  { name: "OpenAI", slug: "openai", healthUrl: "https://api.openai.com/v1/models" },
  { name: "Anthropic", slug: "anthropic", healthUrl: "https://api.anthropic.com/v1/health" },
  { name: "Google", slug: "google", healthUrl: "https://generativelanguage.googleapis.com/v1beta/models" },
  { name: "Azure AI Foundry", slug: "azure-foundry", healthUrl: "https://ochiengandco-openai.cognitiveservices.azure.com/openai/models?api-version=2024-06-01" },
  { name: "Mistral", slug: "mistral", healthUrl: "https://api.mistral.ai/v1/models" },
  { name: "DeepSeek", slug: "deepseek", healthUrl: "https://api.deepseek.com/v1/models" },
  { name: "Cohere", slug: "cohere", healthUrl: "https://api.cohere.com/v1/models" },
  { name: "Qwen", slug: "qwen", healthUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/models" },
];

async function checkProvider(provider: (typeof PROVIDERS)[0]): Promise<ProviderStatus> {
  if (!provider.healthUrl) {
    return { name: provider.name, slug: provider.slug, status: "unknown", latencyMs: null };
  }
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(provider.healthUrl, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // Azure returns 401 without key, which means the service is up
    const isUp = res.status < 500 || (provider.slug === "azure-foundry" && res.status === 401);
    return {
      name: provider.name,
      slug: provider.slug,
      status: isUp ? "up" : "down",
      latencyMs: Date.now() - start,
    };
  } catch {
    return { name: provider.name, slug: provider.slug, status: "down", latencyMs: null };
  }
}

export async function GET() {
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:3001";

  // Check gateway health
  let gatewayStatus: "up" | "down" = "down";
  let gatewayLatency: number | null = null;
  try {
    const start = Date.now();
    const res = await fetch(`${gatewayUrl}/health`, { cache: "no-store" });
    gatewayLatency = Date.now() - start;
    gatewayStatus = res.ok ? "up" : "down";
  } catch {
    gatewayStatus = "down";
  }

  // Check providers in parallel
  const providerStatuses = await Promise.all(PROVIDERS.map(checkProvider));

  return NextResponse.json({
    status: gatewayStatus === "up" ? "operational" : "degraded",
    timestamp: new Date().toISOString(),
    gateway: {
      status: gatewayStatus,
      latencyMs: gatewayLatency,
      url: gatewayUrl,
    },
    providers: providerStatuses,
  });
}
