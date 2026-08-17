function env(name: string): string | undefined {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return g.process?.env?.[name];
}

/** Cloud Run sets K_SERVICE. NODE_ENV=production covers other hosted runtimes. */
export function isProductionRuntime(): boolean {
  return env("NODE_ENV") === "production" || Boolean(env("K_SERVICE"));
}

export function hasTogetherPlatformKey(): boolean {
  return Boolean(env("TOGETHER_API_KEY"));
}

/** Same ADC / project env already used for Vertex Google Search grounding. */
export function hasVertexPlatform(): boolean {
  return Boolean(
    env("GOOGLE_CLOUD_PROJECT") ||
      env("GCP_PROJECT") ||
      env("GCP_PROJECT_ID") ||
      env("VERTEX_API_KEY") ||
      env("GOOGLE_APPLICATION_CREDENTIALS")
  );
}

/**
 * OpenDoor catalog ids verified HTTP 200 on Vertex MaaS (no dedicated GPU).
 * Llama 3.1 / 3.3 / 4, Qwen 2.5, and DeepSeek V3 are not on this list — do not alias them.
 */
export const VERTEX_SERVERLESS_MODEL_IDS = [
  "gemma-4-26b-a4b-it",
  "qwen3-next-80b-instruct",
  "qwen3-next-80b-thinking",
  "qwen3-coder-480b-a35b-instruct",
  "deepseek-v3.2",
  "deepseek-r1",
  "kimi-k2-thinking",
  "minimax-m2",
  "glm-4.7",
  "glm-5",
  "gpt-oss-120b",
  "gpt-oss-20b",
] as const;

export function isVertexServerlessModel(modelId: string): boolean {
  return (VERTEX_SERVERLESS_MODEL_IDS as readonly string[]).includes(modelId);
}

/** Image / video ids that returned HTTP 200 on project-800192c2-3ecc-4889-8f7 (2026-08-17). */
export const VERTEX_IMAGE_MODEL_IDS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
] as const;

export const VERTEX_VIDEO_MODEL_IDS = [
  "veo-3.1-fast-generate-001",
  "veo-3.1-generate-001",
] as const;

/** Legacy Together launch-set ids that Vertex MaaS does not serve 1:1. */
export function isLegacyTogetherServerlessId(modelId: string): boolean {
  return (
    modelId.includes("qwen2.5") ||
    modelId === "deepseek-v3" ||
    modelId === "mistral-7b-instruct" ||
    modelId.startsWith("BAAI/") ||
    (modelId.includes("llama-3.1") && modelId.includes("instruct") && !modelId.includes("instant"))
  );
}

/**
 * Platform wholesale is configured if Vertex ADC/project, Together key, or org BYOK.
 * Production without any of those must not claim serverless is live.
 */
export function shouldAdvertiseServerlessWholesale(opts?: {
  hasOrgByok?: boolean;
}): boolean {
  if (hasVertexPlatform() || hasTogetherPlatformKey() || opts?.hasOrgByok) return true;
  return !isProductionRuntime();
}

/**
 * Together-only rows: still require a Together key (or BYOK) in production.
 * Vertex being up does not make llama-3.1 / qwen2.5 callable.
 */
export function shouldAdvertiseServerlessTogether(opts?: {
  hasOrgByok?: boolean;
}): boolean {
  if (hasTogetherPlatformKey() || opts?.hasOrgByok) return true;
  return !isProductionRuntime();
}

/** Per catalog row: Vertex MaaS ids follow Vertex; Together leftovers follow Together. */
export function shouldAdvertiseServerlessModel(
  modelId: string,
  opts?: { hasOrgByok?: boolean; providerSlug?: string }
): boolean {
  if (opts?.providerSlug === "vertex" || isVertexServerlessModel(modelId)) {
    return hasVertexPlatform() || !isProductionRuntime();
  }
  if (opts?.providerSlug === "together") {
    return shouldAdvertiseServerlessTogether(opts);
  }
  return shouldAdvertiseServerlessWholesale(opts);
}

export function hasRealTrainer(): boolean {
  return Boolean(
    env("TOGETHER_API_KEY") ||
      env("LOCAL_TRAINER_URL") ||
      env("GCP_TRAINER_ENDPOINT") ||
      env("GOOGLE_CLOUD_PROJECT") ||
      env("GCP_PROJECT") ||
      env("GCP_PROJECT_ID") ||
      env("GOOGLE_APPLICATION_CREDENTIALS")
  );
}

/** Simulator is local/dev only, and only when explicitly enabled. */
export function allowSimulatedTraining(): boolean {
  if (isProductionRuntime()) return false;
  return env("ALLOW_SIMULATED_TRAINING") === "1";
}
