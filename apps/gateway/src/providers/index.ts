import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GoogleProvider } from "./google.js";
import { CohereProvider } from "./cohere.js";
import { MistralProvider } from "./mistral.js";
import { DeepSeekProvider } from "./deepseek.js";
import { QwenProvider } from "./qwen.js";
import { AzureFoundryProvider } from "./azure-foundry.js";
import { CustomDeploymentProvider } from "./custom-deployment.js";
import type { ProviderAdapter } from "./base.js";

export type { ProviderAdapter };

const providerMap = new Map<string, ProviderAdapter>();

function register(provider: ProviderAdapter) {
  try {
    providerMap.set(provider.slug, provider);
  } catch {
    // provider env not set, skip
  }
}

// Register Azure first so it wins model resolution
// when multiple providers claim the same model.
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
try {
  register(new CohereProvider());
} catch {
  console.log("Cohere not configured");
}
try {
  register(new MistralProvider());
} catch {
  console.log("Mistral not configured");
}
try {
  register(new DeepSeekProvider());
} catch {
  console.log("DeepSeek not configured");
}
try {
  register(new QwenProvider());
} catch {
  console.log("Qwen not configured");
}

// Register custom deployment provider (no env required)
register(new CustomDeploymentProvider());

export function getProvider(slug: string): ProviderAdapter | undefined {
  return providerMap.get(slug);
}

export function listProviders(): ProviderAdapter[] {
  return Array.from(providerMap.values());
}

// Fallback chains: modelId -> ordered list of provider slugs to try
// Azure is primary for all models it can host.
export const fallbackChains: Record<string, string[]> = {
  // OpenAI GPT family — Azure first
  "gpt-4o": ["azure-foundry", "openai"],
  "gpt-4o-mini": ["azure-foundry", "openai"],
  "gpt-4-turbo": ["azure-foundry", "openai"],
  "gpt-4": ["azure-foundry", "openai"],
  "gpt-3.5-turbo": ["azure-foundry", "openai"],
  // Anthropic
  "claude-3-5-sonnet-20241022": ["anthropic"],
  "claude-3-opus-20240229": ["anthropic"],
  "claude-3-haiku-20240307": ["anthropic"],
  // Google
  "gemini-1.5-pro": ["google"],
  "gemini-1.5-flash": ["google"],
  // Cohere
  "command-r-plus": ["cohere", "azure-foundry"],
  "command-r": ["cohere", "azure-foundry"],
  // Mistral
  "mistral-large-latest": ["azure-foundry", "mistral"],
  "mistral-medium-latest": ["azure-foundry", "mistral"],
  "mistral-small-latest": ["azure-foundry", "mistral"],
  "codestral-latest": ["azure-foundry", "mistral"],
  // DeepSeek
  "deepseek-chat": ["deepseek"],
  "deepseek-coder": ["deepseek"],
  // Qwen
  "qwen-max": ["qwen"],
  "qwen-plus": ["qwen"],
  "qwen-turbo": ["qwen"],
  // Microsoft Phi
  "phi-4": ["azure-foundry"],
  "phi-3-medium-128k-instruct": ["azure-foundry"],
  "phi-3-mini-128k-instruct": ["azure-foundry"],
  // Meta Llama
  "llama-3-3-70b-instruct": ["azure-foundry"],
  "llama-3-2-90b-vision-instruct": ["azure-foundry"],
  "llama-3-2-11b-vision-instruct": ["azure-foundry"],
  "llama-3-1-405b-instruct": ["azure-foundry"],
  "llama-3-1-70b-instruct": ["azure-foundry"],
};

export async function resolveProvider(modelId: string): Promise<{
  provider: ProviderAdapter;
  model: string;
  isCustom?: boolean;
} | null> {
  // Check for custom deployment model IDs (format: custom:<deploymentId>)
  if (modelId.startsWith("custom:")) {
    const customProvider = providerMap.get("custom");
    if (customProvider) {
      return { provider: customProvider, model: modelId, isCustom: true };
    }
  }

  for (const provider of providerMap.values()) {
    if (provider.slug === "custom") continue;
    const models = await provider.listModels();
    const found = models.find((m: any) => m.id === modelId);
    if (found) {
      return { provider, model: found.id };
    }
  }

  // Fallback: try direct model mapping
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
    "mistral-large-latest": "azure-foundry",
    "mistral-medium-latest": "azure-foundry",
    "mistral-small-latest": "azure-foundry",
    "deepseek-chat": "deepseek",
    "deepseek-coder": "deepseek",
    "qwen-max": "qwen",
    "qwen-plus": "qwen",
    "qwen-turbo": "qwen",
    "phi-4": "azure-foundry",
    "phi-3-medium-128k-instruct": "azure-foundry",
    "phi-3-mini-128k-instruct": "azure-foundry",
    "llama-3-3-70b-instruct": "azure-foundry",
    "llama-3-2-90b-vision-instruct": "azure-foundry",
    "llama-3-2-11b-vision-instruct": "azure-foundry",
    "llama-3-1-405b-instruct": "azure-foundry",
    "llama-3-1-70b-instruct": "azure-foundry",
  };

  const slug = directMappings[modelId];
  if (slug) {
    const provider = providerMap.get(slug);
    if (provider) {
      return { provider, model: modelId };
    }
  }

  return null;
}

export function getFallbackChain(modelId: string): string[] {
  return fallbackChains[modelId] || [];
}
