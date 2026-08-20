/** Together leftover → Vertex MaaS successor when Together is not keyed. */
export const LEGACY_TOGETHER_VERTEX_OVERFLOW: Record<string, string> = {
  "deepseek-v3": "deepseek-v3.2",
};

export function vertexOverflowModel(modelId: string): string | null {
  return LEGACY_TOGETHER_VERTEX_OVERFLOW[modelId] || null;
}

export { VERTEX_TOOL_OVERFLOW_MODEL, vertexToolOverflowModel } from "../providers/vertex-tools.js";

export function isKeyedProvider(
  slug: string,
  opts?: { byokSlugs?: Iterable<string>; env?: NodeJS.ProcessEnv }
): boolean {
  const byok = new Set(opts?.byokSlugs || []);
  if (byok.has(slug)) return true;
  const env = opts?.env ?? process.env;
  switch (slug) {
    case "together":
      return Boolean(env.TOGETHER_API_KEY);
    case "deepseek":
      return Boolean(env.DEEPSEEK_API_KEY);
    case "vertex":
      return Boolean(
        env.GOOGLE_CLOUD_PROJECT ||
          env.GCP_PROJECT ||
          env.GCP_PROJECT_ID ||
          env.VERTEX_API_KEY ||
          env.GOOGLE_APPLICATION_CREDENTIALS
      );
    case "groq":
      return Boolean(env.GROQ_API_KEY);
    case "xai":
      return Boolean(env.XAI_API_KEY);
    default:
      return true;
  }
}

/** Catalog id to send to a given provider. */
export function catalogModelForProvider(slug: string, modelId: string): string {
  if (slug === "vertex") {
    return vertexOverflowModel(modelId) || modelId;
  }
  if (
    slug === "deepseek" &&
    (modelId === "deepseek-v3" || modelId === "deepseek-v3.2" || modelId === "deepseek-coder")
  ) {
    return "deepseek-chat";
  }
  return modelId;
}

export type ProviderAttempt = {
  error?: Error;
  response?: unknown;
  streamGenerator?: unknown;
};

/** Continue the fallback loop only when the provider call itself failed. */
export function decideProviderLoop(result: ProviderAttempt): "return" | "continue" {
  if (result.error) return "continue";
  if (result.response || result.streamGenerator) return "return";
  return "continue";
}
