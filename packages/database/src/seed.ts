// @ts-nocheck
// Seed script for open-weight model catalog
// Usage: DATABASE_URL=... bun packages/database/src/seed.ts

import { getDb } from "./client.js";
import { modelCatalog } from "./schema.js";

const catalogEntries = [
  {
    modelId: "llama-3.2-3b-instruct",
    displayName: "Llama 3.2 3B Instruct",
    description: "Small instruction model that runs on this Mac (Apple Silicon / Metal) via Ollama. Best first GPU request.",
    huggingFaceRepo: "meta-llama/Llama-3.2-3B-Instruct",
    ollamaTag: "llama3.2:3b",
    inferenceEngine: "ollama",
    defaultCpu: "2.0",
    defaultMemoryGb: "4.0",
    minGpuMemoryGb: "4.0",
    origin: "us",
    source: "ollama",
    deploymentStatus: "live",
  },
  {
    modelId: "llama-3.1-8b-instruct",
    displayName: "Llama 3.1 8B Instruct",
    description: "Meta's Llama 3.1 8B. Pull via Ollama or deploy on GCP.",
    huggingFaceRepo: "meta-llama/Meta-Llama-3.1-8B-Instruct",
    ollamaTag: "llama3.1:8b",
    inferenceEngine: "ollama",
    defaultCpu: "4.0",
    defaultMemoryGb: "8.0",
    minGpuMemoryGb: "8.0",
    origin: "us",
    source: "ollama",
    deploymentStatus: "dedicated",
  },
  {
    modelId: "mistral-7b-instruct",
    displayName: "Mistral 7B Instruct",
    description: "Mistral AI's 7B instruction-tuned model. Excellent performance for its size.",
    huggingFaceRepo: "mistralai/Mistral-7B-Instruct-v0.3",
    ollamaTag: "mistral:7b",
    inferenceEngine: "ollama",
    defaultCpu: "4.0",
    defaultMemoryGb: "8.0",
    minGpuMemoryGb: "8.0",
    origin: "eu",
    source: "ollama",
    deploymentStatus: "dedicated",
  },
  {
    modelId: "qwen2.5-7b-instruct",
    displayName: "Qwen 2.5 7B Instruct",
    description: "Alibaba Qwen 2.5 7B — strong multilingual, open weight from China.",
    huggingFaceRepo: "Qwen/Qwen2.5-7B-Instruct",
    ollamaTag: "qwen2.5:7b",
    inferenceEngine: "ollama",
    defaultCpu: "4.0",
    defaultMemoryGb: "8.0",
    minGpuMemoryGb: "8.0",
    origin: "cn",
    source: "ollama",
    deploymentStatus: "dedicated",
  },
  {
    modelId: "gemma-2-9b-it",
    displayName: "Gemma 2 9B IT",
    description: "Google's Gemma 2 9B instruction-tuned model. Efficient and capable.",
    huggingFaceRepo: "google/gemma-2-9b-it",
    ollamaTag: "gemma2:9b",
    inferenceEngine: "ollama",
    defaultCpu: "4.0",
    defaultMemoryGb: "10.0",
    minGpuMemoryGb: "10.0",
    origin: "us",
    source: "ollama",
    deploymentStatus: "dedicated",
  },
  {
    modelId: "deepseek-r1-distill-qwen-7b",
    displayName: "DeepSeek R1 Distill Qwen 7B",
    description: "Reasoning distill of DeepSeek-R1 on Qwen. Listed from Hugging Face for fast open-weight access.",
    huggingFaceRepo: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    ollamaTag: "deepseek-r1:7b",
    inferenceEngine: "ollama",
    defaultCpu: "4.0",
    defaultMemoryGb: "8.0",
    minGpuMemoryGb: "8.0",
    origin: "cn",
    source: "huggingface",
    deploymentStatus: "warming",
  },
  {
    modelId: "codestral-latest",
    displayName: "Codestral",
    description: "Open-weight Mistral code model. Call it serverless, or run locally on Apple Silicon / NVIDIA with ~16 GB.",
    huggingFaceRepo: "mistralai/Codestral-22B-v0.1",
    ollamaTag: "codestral",
    inferenceEngine: "ollama",
    defaultCpu: "4.0",
    defaultMemoryGb: "16.0",
    minGpuMemoryGb: "16.0",
    origin: "eu",
    source: "provider_api",
    deploymentStatus: "live",
    serverless: true,
  },
];

async function seed() {
  const db = getDb();

  for (const entry of catalogEntries) {
    await db
      .insert(modelCatalog)
      .values(entry)
      .onConflictDoNothing({ target: modelCatalog.modelId });
  }

  console.log(`Seeded ${catalogEntries.length} catalog entries`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
