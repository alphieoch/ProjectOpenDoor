export const OLLAMA_MODEL_MAP: Record<string, string> = {
  "llama-3.2-3b-instruct": "llama3.2:3b",
  "llama-3.1-8b-instruct": "llama3.1:8b",
  "mistral-7b-instruct": "mistral:7b",
  "qwen2.5-7b-instruct": "qwen2.5:7b",
  "gemma-2-9b-it": "gemma2:9b",
  "codestral-latest": "codestral",
  codestral: "codestral",
};

export function resolveOllamaTag(modelId: string, catalogTag?: string | null): string {
  if (catalogTag) return catalogTag;
  if (modelId.startsWith("hf.co/")) return modelId;
  const stripped = modelId.replace(/^https?:\/\/(www\.)?huggingface\.co\//i, "");
  if (stripped.includes("/") && !stripped.startsWith("ollama:")) {
    return `hf.co/${stripped}`;
  }
  return OLLAMA_MODEL_MAP[modelId] || modelId;
}
