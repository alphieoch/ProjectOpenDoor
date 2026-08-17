import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GoogleProvider } from "./google.js";
import { CohereProvider } from "./cohere.js";
import { MistralProvider } from "./mistral.js";
import { DeepSeekProvider } from "./deepseek.js";
import { QwenProvider } from "./qwen.js";
import { AzureFoundryProvider } from "./azure-foundry.js";
import { CustomDeploymentProvider } from "./custom-deployment.js";
import { OllamaProvider } from "./ollama.js";
import { TogetherProvider } from "./together.js";
import type { ProviderAdapter } from "./base.js";

export type { ProviderAdapter };

const providerMap = new Map<string, ProviderAdapter>();

/** Open-weight providers resolve before closed/Azure so catalog calls stay open-first. */
const OPEN_WEIGHT_SLUGS = [
  "together",
  "ollama",
  "custom",
  "deepseek",
  "qwen",
  "mistral",
] as const;

function register(provider: ProviderAdapter) {
  try {
    providerMap.set(provider.slug, provider);
  } catch {
    // provider env not set, skip
  }
}

// Serverless wholesale first (warm multi-tenant — no Request GPU).
// Registers even without TOGETHER_API_KEY so model IDs resolve with a clear error.
register(new TogetherProvider());
if (!process.env.TOGETHER_API_KEY) {
  console.log("Together registered (serverless IDs live) — set TOGETHER_API_KEY to route traffic");
}

// Open-weight: local GPU, custom deploys, then open vendor APIs.
register(new CustomDeploymentProvider());
register(new OllamaProvider());

register(new DeepSeekProvider());
if (!process.env.DEEPSEEK_API_KEY) {
  console.log("DeepSeek registered — set DEEPSEEK_API_KEY to route traffic");
}
try {
  register(new QwenProvider());
} catch {
  console.log("Qwen not configured");
}
try {
  register(new MistralProvider());
} catch {
  console.log("Mistral not configured");
}

// Closed / marketplace providers (optional)
try {
  register(new AzureFoundryProvider());
} catch {
  console.log("Azure not configured");
}
try {
  register(new OpenAIProvider());
} catch {
  console.log("OpenAI not configured");
}
try {
  register(new AnthropicProvider());
} catch {
  console.log("Anthropic not configured");
}
try {
  register(new GoogleProvider());
} catch {
  console.log("Google not configured");
}
register(new CohereProvider());
if (!process.env.COHERE_API_KEY) {
  console.log("Cohere registered (rerank IDs live) — set COHERE_API_KEY to route traffic");
}

export function getProvider(slug: string): ProviderAdapter | undefined {
  return providerMap.get(slug);
}

export function listProviders(): ProviderAdapter[] {
  return Array.from(providerMap.values());
}

function orderedProviders(): ProviderAdapter[] {
  const open = OPEN_WEIGHT_SLUGS.map((s) => providerMap.get(s)).filter(
    (p): p is ProviderAdapter => Boolean(p)
  );
  const rest = Array.from(providerMap.values()).filter(
    (p) => !(OPEN_WEIGHT_SLUGS as readonly string[]).includes(p.slug)
  );
  return [...open, ...rest];
}

// Fallback chains: open-weight models prefer native providers; closed keep Azure/OpenAI.
export const fallbackChains: Record<string, string[]> = {
  "gpt-4o": ["azure-foundry", "openai"],
  "gpt-4o-mini": ["azure-foundry", "openai"],
  "gpt-4-turbo": ["azure-foundry", "openai"],
  "gpt-4": ["azure-foundry", "openai"],
  "gpt-3.5-turbo": ["azure-foundry", "openai"],
  "claude-3-5-sonnet-20241022": ["anthropic"],
  "claude-3-opus-20240229": ["anthropic"],
  "claude-3-haiku-20240307": ["anthropic"],
  "gemini-1.5-pro": ["google"],
  "gemini-1.5-flash": ["google"],
  "command-r-plus": ["cohere", "azure-foundry"],
  "command-r": ["cohere", "azure-foundry"],
  // Open-weight: native first
  "mistral-large-latest": ["mistral", "azure-foundry"],
  "mistral-medium-latest": ["mistral", "azure-foundry"],
  "mistral-small-latest": ["mistral", "azure-foundry"],
  "codestral-latest": ["mistral", "azure-foundry"],
  "deepseek-chat": ["deepseek", "together"],
  "deepseek-coder": ["deepseek", "together"],
  "qwen-max": ["qwen"],
  "qwen-plus": ["qwen"],
  "qwen-turbo": ["qwen"],
  "qwen-coder-plus": ["qwen"],
  "qwen3.8-max": ["qwen"],
  "llama3.2:3b": ["ollama"],
  "llama3.1:8b": ["ollama"],
  "mistral:7b": ["ollama"],
  "qwen2.5:7b": ["ollama"],
  "gemma2:9b": ["ollama"],
  // Serverless launch set (Together wholesale)
  "llama-3.1-8b-instruct": ["together"],
  "llama-3.1-70b-instruct": ["together"],
  "qwen2.5-7b-instruct": ["together"],
  "qwen2.5-72b-instruct": ["together"],
  "deepseek-v3": ["together", "deepseek"],
  "mistral-7b-instruct": ["together", "mistral"],
  "BAAI/bge-base-en-v1.5": ["together"],
  "phi-4": ["azure-foundry"],
  "phi-3-medium-128k-instruct": ["azure-foundry"],
  "phi-3-mini-128k-instruct": ["azure-foundry"],
  "llama-3-3-70b-instruct": ["azure-foundry", "ollama"],
  "llama-3-2-90b-vision-instruct": ["azure-foundry"],
  "llama-3-2-11b-vision-instruct": ["azure-foundry"],
  "llama-3-1-405b-instruct": ["azure-foundry"],
  "llama-3-1-70b-instruct": ["azure-foundry"],
};

const directMappings: Record<string, string> = {
  "gpt-4o": "azure-foundry",
  "gpt-4o-mini": "azure-foundry",
  "gpt-4-turbo": "azure-foundry",
  "gpt-4": "azure-foundry",
  "gpt-3.5-turbo": "azure-foundry",
  "claude-3-5-sonnet-20241022": "anthropic",
  "claude-3-opus-20240229": "anthropic",
  "claude-3-haiku-20240307": "anthropic",
  "gemini-1.5-pro": "google",
  "gemini-1.5-flash": "google",
  "command-r-plus": "cohere",
  "command-r": "cohere",
  "mistral-large-latest": "mistral",
  "mistral-medium-latest": "mistral",
  "mistral-small-latest": "mistral",
  "codestral-latest": "mistral",
  "deepseek-chat": "deepseek",
  "deepseek-coder": "deepseek",
  "qwen-max": "qwen",
  "qwen-plus": "qwen",
  "qwen-turbo": "qwen",
  "qwen-coder-plus": "qwen",
  "qwen3.8-max": "qwen",
  "llama3.2:3b": "ollama",
  "llama3.1:8b": "ollama",
  "mistral:7b": "ollama",
  "qwen2.5:7b": "ollama",
  "gemma2:9b": "ollama",
  "llama-3.1-8b-instruct": "together",
  "llama-3.1-70b-instruct": "together",
  "qwen2.5-7b-instruct": "together",
  "qwen2.5-72b-instruct": "together",
  "deepseek-v3": "together",
  "mistral-7b-instruct": "together",
  "BAAI/bge-base-en-v1.5": "together",
  "phi-4": "azure-foundry",
  "phi-3-medium-128k-instruct": "azure-foundry",
  "phi-3-mini-128k-instruct": "azure-foundry",
  "llama-3-3-70b-instruct": "azure-foundry",
  "llama-3-2-90b-vision-instruct": "azure-foundry",
  "llama-3-2-11b-vision-instruct": "azure-foundry",
  "llama-3-1-405b-instruct": "azure-foundry",
  "llama-3-1-70b-instruct": "azure-foundry",
};

export async function resolveProvider(modelId: string): Promise<{
  provider: ProviderAdapter;
  model: string;
  isCustom?: boolean;
} | null> {
  if (modelId.startsWith("custom:") || modelId.startsWith("router:")) {
    const customProvider = providerMap.get("custom");
    if (customProvider) {
      return { provider: customProvider, model: modelId, isCustom: true };
    }
  }

  if (modelId.startsWith("ft:")) {
    const { fineTunedModels } = await import("@opendoor/database");
    const { eq, and } = await import("drizzle-orm");
    const { db } = await import("@opendoor/database");
    const rows = await db
      .select()
      .from(fineTunedModels)
      .where(
        and(eq(fineTunedModels.modelId, modelId), eq(fineTunedModels.status, "active"))
      )
      .limit(1);
    const ft = rows[0];
    if (ft) {
      const slug = ft.providerSlug || "together";
      const provider = providerMap.get(slug) || providerMap.get("together");
      if (provider) {
        // Route inference to base model id on wholesale; Together FT models use their own id
        const upstream =
          slug === "together" && !(ft.metadata as any)?.simulated
            ? modelId.replace(/^ft:/, "")
            : ft.baseModelId;
        return { provider, model: upstream };
      }
    }
  }

  if (modelId.startsWith("ollama:")) {
    const ollama = providerMap.get("ollama");
    if (ollama) {
      return { provider: ollama, model: modelId.replace(/^ollama:/, "") };
    }
  }

  // Prefer open-weight providers when scanning listModels()
  for (const provider of orderedProviders()) {
    if (provider.slug === "custom") continue;
    const models = await provider.listModels();
    const found = models.find((m: any) => m.id === modelId);
    if (found) {
      return { provider, model: found.id };
    }
  }

  const slug = directMappings[modelId];
  if (slug) {
    const provider = providerMap.get(slug);
    if (provider) {
      return { provider, model: modelId };
    }
  }

  for (const fb of getFallbackChain(modelId)) {
    if (fb === slug) continue;
    const provider = providerMap.get(fb);
    if (!provider) continue;
    if (fb === "together" && !process.env.TOGETHER_API_KEY) continue;
    return { provider, model: modelId };
  }

  if (/qwen3\.?8/i.test(modelId)) {
    const qwen = providerMap.get("qwen");
    if (qwen) return { provider: qwen, model: "qwen3.8-max" };
  }

  if (modelId.startsWith("hf.co/") || (modelId.includes("/") && !modelId.startsWith("custom:"))) {
    const ollama = providerMap.get("ollama");
    if (ollama) return { provider: ollama, model: modelId.replace(/^hf\.co\//, "hf.co/") };
  }

  return null;
}

export function getFallbackChain(modelId: string): string[] {
  return fallbackChains[modelId] || [];
}
