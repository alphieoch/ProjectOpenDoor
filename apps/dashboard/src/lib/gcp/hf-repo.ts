/** Open-weight ids → a Hugging Face repo that fits a Cloud Run L4. */
const HF_BY_MODEL: Record<string, string> = {
  "deepseek-coder": "deepseek-ai/deepseek-coder-6.7b-instruct",
  "deepseek-chat": "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
  "deepseek-v3": "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
  "llama3.2:3b": "Qwen/Qwen2.5-3B-Instruct",
  "llama3.1:8b": "Qwen/Qwen2.5-7B-Instruct",
  "llama-3.1-8b-instruct": "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "llama-3.1-70b-instruct": "Qwen/Qwen2.5-7B-Instruct",
  "qwen2.5-7b-instruct": "Qwen/Qwen2.5-7B-Instruct",
  "qwen2.5-72b-instruct": "Qwen/Qwen2.5-7B-Instruct",
  "qwen-max": "Qwen/Qwen2.5-7B-Instruct",
  "qwen-plus": "Qwen/Qwen2.5-7B-Instruct",
  "qwen-turbo": "Qwen/Qwen2.5-3B-Instruct",
  "qwen-coder-plus": "Qwen/Qwen2.5-Coder-7B-Instruct",
  "qwen3.8-27b": "Qwen/Qwen3.8-27B",
  "qwen3.8-27b-fp8": "Qwen/Qwen3.8-27B-FP8",
  "qwen3.8-27b-awq": "barrydeen/Qwen3.8-27B-AWQ-4bit",
  "mistral-7b-instruct": "mistralai/Mistral-7B-Instruct-v0.3",
  "mistral:7b": "mistralai/Mistral-7B-Instruct-v0.3",
  "mistral-small-latest": "mistralai/Mistral-7B-Instruct-v0.3",
};

const CLOSED = /^(gpt-|claude-|gemini-|command-r|qwen3\.8-max)/i;

export function isClosedApiModel(modelId: string): boolean {
  return CLOSED.test(modelId);
}

export function resolveHfRepo(modelId: string, hinted?: string | null): string | null {
  const hint = (hinted || "").trim();
  if (hint.includes("/") && !hint.startsWith("custom:")) {
    return hint.replace(/^https?:\/\/(www\.)?huggingface\.co\//i, "");
  }
  if (HF_BY_MODEL[modelId]) return HF_BY_MODEL[modelId];
  const lower = modelId.toLowerCase();
  for (const [key, repo] of Object.entries(HF_BY_MODEL)) {
    if (lower === key || lower.startsWith(`${key}-`) || lower.startsWith(`${key}:`)) return repo;
  }
  if (modelId.includes("/") && !modelId.startsWith("custom:")) {
    return modelId.replace(/^hf\.co\//, "");
  }
  return null;
}

export function gcpAvailable(): boolean {
  return Boolean(process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT);
}
