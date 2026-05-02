// @ts-nocheck
// Seed script for model catalog and other static data
// Usage: DATABASE_URL=... bun packages/database/src/seed.ts

import { getDb } from "./client.js";
import { modelCatalog } from "./schema.js";

const catalogEntries = [
  {
    modelId: "llama-3.1-8b-instruct",
    displayName: "Llama 3.1 8B Instruct",
    description: "Meta's Llama 3.1 8B parameter instruction-tuned model. Great for general chat and reasoning tasks.",
    huggingFaceRepo: "meta-llama/Meta-Llama-3.1-8B-Instruct",
    inferenceEngine: "vllm",
    defaultCpu: "1.0",
    defaultMemoryGb: "2.0",
  },
  {
    modelId: "mistral-7b-instruct",
    displayName: "Mistral 7B Instruct",
    description: "Mistral AI's 7B instruction-tuned model. Excellent performance for its size.",
    huggingFaceRepo: "mistralai/Mistral-7B-Instruct-v0.3",
    inferenceEngine: "vllm",
    defaultCpu: "1.0",
    defaultMemoryGb: "2.0",
  },
  {
    modelId: "qwen2.5-7b-instruct",
    displayName: "Qwen 2.5 7B Instruct",
    description: "Alibaba Qwen 2.5 7B instruction-tuned model. Strong multilingual capabilities.",
    huggingFaceRepo: "Qwen/Qwen2.5-7B-Instruct",
    inferenceEngine: "vllm",
    defaultCpu: "1.0",
    defaultMemoryGb: "2.0",
  },
  {
    modelId: "gemma-2-9b-it",
    displayName: "Gemma 2 9B IT",
    description: "Google's Gemma 2 9B instruction-tuned model. Efficient and capable.",
    huggingFaceRepo: "google/gemma-2-9b-it",
    inferenceEngine: "vllm",
    defaultCpu: "1.0",
    defaultMemoryGb: "2.5",
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
