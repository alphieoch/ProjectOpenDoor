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
import { VertexProvider } from "./vertex.js";
import { GroqProvider } from "./groq.js";
import { XaiProvider } from "./xai.js";
import { CerebrasProvider } from "./cerebras.js";
import { PerplexityProvider } from "./perplexity.js";
import { registerExtraProviders } from "./extras.js";
import type { ProviderAdapter } from "./base.js";
import { hasVertexPlatform, isProductionRuntime } from "@opendoor/shared";
import {
  catalogModelForProvider,
  isKeyedProvider,
  vertexOverflowModel,
} from "../lib/chat-provider.js";

export type { ProviderAdapter };

const QWEN38_METAL_IDS = ["qwen3.8-27b", "qwen3.8-27b-fp8", "qwen3.8-27b-awq"] as const;

async function resolveQwen38Metal(
  modelId: string
): Promise<{ provider: ProviderAdapter; model: string; isCustom: true } | null> {
  if (!(QWEN38_METAL_IDS as readonly string[]).includes(modelId)) return null;
  const custom = providerMap.get("custom");
  if (!custom) return null;
  try {
    const { db, deployments } = await import("@opendoor/database");
    const { and, eq, inArray, or } = await import("drizzle-orm");
    const rows = await db
      .select({ id: deployments.id })
      .from(deployments)
      .where(
        and(
          eq(deployments.status, "running"),
          or(
            inArray(deployments.runtimeModel, [...QWEN38_METAL_IDS]),
            eq(deployments.sourceValue, "barrydeen/Qwen3.8-27B-AWQ-4bit"),
            eq(deployments.weightsUri, "barrydeen/Qwen3.8-27B-AWQ-4bit"),
            eq(deployments.weightsUri, "Qwen/Qwen3.8-27B"),
            eq(deployments.weightsUri, "Qwen/Qwen3.8-27B-FP8")
          )
        )
      )
      .limit(1);
    const id = rows[0]?.id;
    if (!id) return null;
    return { provider: custom, model: `custom:${id}`, isCustom: true };
  } catch {
    return null;
  }
}

const providerMap = new Map<string, ProviderAdapter>();

/** Open-weight providers resolve before closed/Azure so catalog calls stay open-first. */
const OPEN_WEIGHT_SLUGS = [
  "vertex",
  "together",
  "groq",
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

// Vertex Model Garden first (ADC / GCP project). Together is optional overflow.
register(new VertexProvider());
if (!hasVertexPlatform()) {
  console.log(
    isProductionRuntime()
      ? "Vertex registered but not advertised (production without GCP project / ADC)"
      : "Vertex registered (dev IDs only) — set GOOGLE_CLOUD_PROJECT and ADC to route serverless traffic"
  );
}

register(new TogetherProvider());
if (!process.env.TOGETHER_API_KEY) {
  console.log(
    isProductionRuntime()
      ? "Together registered but not advertised (production without TOGETHER_API_KEY)"
      : "Together registered (dev IDs only) — optional overflow if TOGETHER_API_KEY is set"
  );
}

register(new GroqProvider());
if (!process.env.GROQ_API_KEY) {
  console.log("Groq registered — set GROQ_API_KEY or org BYOK to route traffic");
}
register(new XaiProvider());
if (!process.env.XAI_API_KEY) {
  console.log("xAI registered — set XAI_API_KEY or org BYOK to route traffic");
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
registerExtraProviders(register);

export function getProvider(slug: string): ProviderAdapter | undefined {
  return providerMap.get(slug);
}

/** Build a provider instance, optionally with an org BYOK key. */
export function instantiateProvider(
  slug: string,
  apiKey?: string
): ProviderAdapter | undefined {
  if (apiKey) {
    try {
      switch (slug) {
        case "vertex":
          return new VertexProvider(apiKey);
        case "together":
          return new TogetherProvider(apiKey);
        case "groq":
          return new GroqProvider(apiKey);
        case "xai":
          return new XaiProvider(apiKey);
        case "openai":
          return new OpenAIProvider(apiKey);
        case "anthropic":
          return new AnthropicProvider(apiKey);
        case "google":
          return new GoogleProvider(apiKey);
        case "mistral":
          return new MistralProvider(apiKey);
        case "qwen":
          return new QwenProvider(apiKey);
        case "deepseek":
          return new DeepSeekProvider(apiKey);
        case "cohere":
          return new CohereProvider(apiKey);
        case "azure-foundry":
          return new AzureFoundryProvider(apiKey);
        case "cerebras":
          return new CerebrasProvider(apiKey);
        case "perplexity":
          return new PerplexityProvider(apiKey);
        default:
          break;
      }
    } catch {
      return undefined;
    }
  }
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
  "gemini-2.5-flash": ["vertex", "google"],
  "gemini-2.5-pro": ["vertex", "google"],
  "command-r-plus": ["cohere", "azure-foundry"],
  "command-r": ["cohere", "azure-foundry"],
  // Open-weight: native first
  "mistral-large-latest": ["mistral", "azure-foundry"],
  "mistral-medium-latest": ["mistral", "azure-foundry"],
  "mistral-small-latest": ["mistral", "azure-foundry"],
  "codestral-latest": ["mistral", "azure-foundry"],
  "deepseek-chat": ["deepseek", "together", "groq"],
  "deepseek-coder": ["deepseek", "together", "groq"],
  "grok-2": ["xai"],
  "grok-2-mini": ["xai"],
  "grok-3": ["xai"],
  "grok-3-mini": ["xai"],
  "llama-3.1-8b-instant": ["groq", "together"],
  "llama-3.3-70b-versatile": ["groq", "together"],
  "qwen-max": ["qwen"],
  "qwen-plus": ["qwen"],
  "qwen-turbo": ["qwen"],
  "qwen-coder-plus": ["qwen"],
  "qwen3.8-max": ["qwen"],
  "qwen3.8-27b": ["custom", "qwen"],
  "qwen3.8-27b-fp8": ["custom", "qwen"],
  "qwen3.8-27b-awq": ["custom", "qwen"],
  "llama3.2:3b": ["ollama"],
  "llama3.1:8b": ["ollama"],
  "mistral:7b": ["ollama"],
  "qwen2.5:7b": ["ollama"],
  "gemma2:9b": ["ollama"],
  // Vertex MaaS (HTTP 200 on project-800192c2-3ecc-4889-8f7) then optional overflow
  "gemma-4-26b-a4b-it": ["vertex"],
  "qwen3-next-80b-instruct": ["vertex", "qwen"],
  "qwen3-next-80b-thinking": ["vertex", "qwen"],
  "qwen3-coder-480b-a35b-instruct": ["vertex", "qwen"],
  "deepseek-v3.2": ["vertex", "deepseek"],
  "deepseek-r1": ["vertex", "deepseek"],
  "kimi-k2-thinking": ["vertex"],
  "minimax-m2": ["vertex"],
  "glm-4.7": ["vertex"],
  "glm-5": ["vertex"],
  "gpt-oss-120b": ["vertex", "cerebras"],
  "gpt-oss-20b": ["vertex", "azure-foundry"],
  // Llama MaaS still 404 — do not prefer Vertex or alias to Gemma/Gemini
  "llama-3.3-70b-instruct": ["together", "groq"],
  // Legacy Together launch set — not 1:1 on Vertex MaaS
  "llama-3.1-8b-instruct": ["together", "groq", "ollama"],
  "llama-3.1-70b-instruct": ["together", "groq"],
  "qwen2.5-7b-instruct": ["together", "qwen", "ollama"],
  "qwen2.5-72b-instruct": ["together", "qwen"],
  "deepseek-v3": ["together", "vertex", "deepseek"],
  "mistral-7b-instruct": ["together", "mistral", "ollama"],
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
  "gemini-2.5-flash": "vertex",
  "gemini-2.5-pro": "vertex",
  "command-r-plus": "cohere",
  "command-r": "cohere",
  "mistral-large-latest": "mistral",
  "mistral-medium-latest": "mistral",
  "mistral-small-latest": "mistral",
  "codestral-latest": "mistral",
  "deepseek-chat": "deepseek",
  "deepseek-coder": "deepseek",
  "grok-2": "xai",
  "grok-2-mini": "xai",
  "grok-3": "xai",
  "grok-3-mini": "xai",
  "llama-3.1-8b-instant": "groq",
  "llama-3.3-70b-versatile": "groq",
  "qwen-max": "qwen",
  "qwen-plus": "qwen",
  "qwen-turbo": "qwen",
  "qwen-coder-plus": "qwen",
  "qwen3.8-max": "qwen",
  "qwen3.8-27b": "qwen",
  "qwen3.8-27b-fp8": "qwen",
  "qwen3.8-27b-awq": "qwen",
  "llama3.2:3b": "ollama",
  "llama3.1:8b": "ollama",
  "mistral:7b": "ollama",
  "qwen2.5:7b": "ollama",
  "gemma2:9b": "ollama",
  "gemma-4-26b-a4b-it": "vertex",
  "qwen3-next-80b-instruct": "vertex",
  "qwen3-next-80b-thinking": "vertex",
  "qwen3-coder-480b-a35b-instruct": "vertex",
  "deepseek-v3.2": "vertex",
  "deepseek-r1": "vertex",
  "kimi-k2-thinking": "vertex",
  "minimax-m2": "vertex",
  "glm-4.7": "vertex",
  "glm-5": "vertex",
  "gpt-oss-120b": "vertex",
  "gpt-oss-20b": "vertex",
  "llama-3.3-70b-instruct": "together",
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

export async function resolveProvider(
  modelId: string,
  opts?: { byokSlugs?: string[]; organizationId?: string }
): Promise<{
  provider: ProviderAdapter;
  model: string;
  isCustom?: boolean;
} | null> {
  const byokSlugs = new Set(opts?.byokSlugs || []);
  if (modelId.startsWith("premium:")) {
    const { resolvePremiumModel } = await import("../lib/premium.js");
    const resolvedCustom = await resolvePremiumModel(modelId, opts?.organizationId);
    const customProvider = providerMap.get("custom");
    if (customProvider && resolvedCustom) {
      return { provider: customProvider, model: resolvedCustom, isCustom: true };
    }
    return null;
  }

  if (modelId.startsWith("custom:") || modelId.startsWith("router:")) {
    const customProvider = providerMap.get("custom");
    if (customProvider) {
      return { provider: customProvider, model: modelId, isCustom: true };
    }
  }

  const metal = await resolveQwen38Metal(modelId);
  if (metal) return metal;

  if ((QWEN38_METAL_IDS as readonly string[]).includes(modelId)) {
    const qwen = providerMap.get("qwen");
    if (qwen) return { provider: qwen, model: "qwen3.8-max" };
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
      const provider =
        (byokSlugs.has(slug) ? instantiateProvider(slug) : undefined) ||
        providerMap.get(slug) ||
        providerMap.get("together");
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
    if (!isKeyedProvider(provider.slug, { byokSlugs })) continue;
    const models = await provider.listModels();
    const found = models.find((m: any) => m.id === modelId);
    if (found) {
      return { provider, model: found.id };
    }
  }

  const slug = directMappings[modelId];
  if (slug && isKeyedProvider(slug, { byokSlugs })) {
    const provider = byokSlugs.has(slug)
      ? instantiateProvider(slug) || providerMap.get(slug)
      : providerMap.get(slug);
    if (provider) {
      return { provider, model: catalogModelForProvider(slug, modelId) };
    }
  }

  for (const fb of getFallbackChain(modelId)) {
    if (fb === slug) continue;
    if (!isKeyedProvider(fb, { byokSlugs })) continue;
    const provider = byokSlugs.has(fb)
      ? instantiateProvider(fb) || providerMap.get(fb)
      : providerMap.get(fb);
    if (!provider) continue;
    return { provider, model: catalogModelForProvider(fb, modelId) };
  }

  const overflow = vertexOverflowModel(modelId);
  if (overflow && isKeyedProvider("vertex", { byokSlugs })) {
    const vertex = providerMap.get("vertex");
    if (vertex) return { provider: vertex, model: overflow };
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
