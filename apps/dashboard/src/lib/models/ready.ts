import { gcpAvailable } from "@/lib/gcp/hf-repo";
import { hasTogetherPlatformKey, hasVertexPlatform } from "@opendoor/shared";

/** Whether this catalog row can actually complete a playground chat right now. */
export function isProviderConfigured(slug: string | null | undefined): boolean {
  switch ((slug || "").toLowerCase()) {
    case "ollama":
    case "custom":
    case "local gpu":
      return true;
    case "vertex":
      return hasVertexPlatform();
    case "together":
      return hasTogetherPlatformKey();
    case "groq":
      return Boolean(process.env.GROQ_API_KEY);
    case "xai":
      return Boolean(process.env.XAI_API_KEY);
    case "deepseek":
      return Boolean(process.env.DEEPSEEK_API_KEY);
    case "qwen":
      return Boolean(process.env.QWEN_API_KEY);
    case "mistral":
      return Boolean(process.env.MISTRAL_API_KEY);
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case "google":
      return Boolean(
        process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || hasVertexPlatform()
      );
    case "cohere":
      return Boolean(process.env.COHERE_API_KEY);
    case "azure-foundry":
    case "azure":
      return Boolean(
        process.env.AZURE_AI_FOUNDRY_API_KEY ||
          process.env.AZURE_INFERENCE_API_KEY ||
          process.env.AZURE_OPENAI_API_KEY,
      );
    default:
      return false;
  }
}

export function isCatalogRowReady(opts: {
  providerSlug?: string | null;
  source?: string | null;
  family?: string | null;
  mine?: boolean;
  id?: string;
}): boolean {
  if (opts.mine) return true;
  if (
    opts.id?.startsWith("custom:") ||
    opts.id?.startsWith("premium:") ||
    opts.id?.startsWith("ollama:")
  ) {
    return true;
  }
  if (opts.family === "open_weight" && gcpAvailable()) return true;
  if (opts.source === "ollama") return true;
  return isProviderConfigured(opts.providerSlug);
}
