import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GoogleProvider } from "./google.js";
import { CohereProvider } from "./cohere.js";
import { MistralProvider } from "./mistral.js";
import { DeepSeekProvider } from "./deepseek.js";
import { QwenProvider } from "./qwen.js";
import { AzureFoundryProvider } from "./azure-foundry.js";
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

try {
  register(new AzureFoundryProvider());
} catch {
  console.log("Azure Foundry not configured");
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

export function getProvider(slug: string): ProviderAdapter | undefined {
  return providerMap.get(slug);
}

export function listProviders(): ProviderAdapter[] {
  return Array.from(providerMap.values());
}

export async function resolveProvider(modelId: string): Promise<{
  provider: ProviderAdapter;
  model: string;
} | null> {
  for (const provider of providerMap.values()) {
    const models = await provider.listModels();
    const found = models.find((m: any) => m.id === modelId);
    if (found) {
      return { provider, model: found.id };
    }
  }

  // Fallback: try direct model mapping
  const directMappings: Record<string, string> = {
    "gpt-4o": "openai",
    "gpt-4o-mini": "openai",
    "gpt-4-turbo": "openai",
    "gpt-4": "openai",
    "gpt-3.5-turbo": "openai",
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
    "deepseek-chat": "deepseek",
    "deepseek-coder": "deepseek",
    "qwen-max": "qwen",
    "qwen-plus": "qwen",
    "qwen-turbo": "qwen",
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
