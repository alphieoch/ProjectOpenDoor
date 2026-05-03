import { db } from "../packages/database/src";
import { models } from "../packages/database/src/schema";
import { eq, and } from "drizzle-orm";

// Azure provider ID
const AZURE_PROVIDER_ID = "5dbb672e-98cb-436c-ae3c-4aad201a0389";

// Models that are actually deployed and live in Azure
const LIVE_MODELS = new Set([
  "gpt-4o-mini",
  "Kimi-K2.6-1",
  "gpt-4o",
  "o3-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "o4-mini",
  "text-embedding-3-small",
]);

const CATALOG = [
  { name: "Kimi-K2.6", publisher: "Moonshot AI", tasks: ["chat-completion"] },
  { name: "gpt-image-2", publisher: "OpenAI", tasks: ["text-to-image", "image-to-image"] },
  { name: "claude-opus-4-7", publisher: "Anthropic", tasks: ["messages"] },
  { name: "MAI-Image-2e", publisher: "Microsoft", tasks: ["text-to-image"] },
  { name: "grok-4-20-reasoning", publisher: "xAI", tasks: ["chat-completion"] },
  { name: "grok-4-20-non-reasoning", publisher: "xAI", tasks: ["chat-completion"] },
  { name: "MAI-Image-2", publisher: "Microsoft", tasks: ["text-to-image"] },
  { name: "MAI-Voice-1", publisher: "Microsoft", tasks: ["text-to-speech", "audio-generation"] },
  { name: "MAI-Transcribe-1", publisher: "Microsoft", tasks: ["automatic-speech-recognition", "speech-to-text"] },
  { name: "gpt-5.4-nano", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-5.4-mini", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-5.4-pro", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-5.4", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "FW-MiniMax-M2.5", publisher: "Fireworks", tasks: ["chat-completion"] },
  { name: "claude-opus-4-6", publisher: "Anthropic", tasks: ["messages"] },
  { name: "claude-sonnet-4-6", publisher: "Anthropic", tasks: ["messages"] },
  { name: "gpt-5.3-codex", publisher: "OpenAI", tasks: ["responses"] },
  { name: "model-router", publisher: "Microsoft", tasks: ["chat-completion"] },
  { name: "Kimi-K2.5", publisher: "Moonshot AI", tasks: ["chat-completion"] },
  { name: "qwen-qwen3.5-9b", publisher: "Hugging Face", tasks: ["chat-completion"] },
  { name: "gpt-5.3-chat", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "grok-4-1-fast-non-reasoning", publisher: "xAI", tasks: ["chat-completion"] },
  { name: "grok-4-1-fast-reasoning", publisher: "xAI", tasks: ["chat-completion"] },
  { name: "FW-GLM-5", publisher: "Fireworks", tasks: ["chat-completion"] },
  { name: "FW-GPT-OSS-120B", publisher: "Fireworks", tasks: ["chat-completion"] },
  { name: "gpt-audio-1.5", publisher: "OpenAI", tasks: ["audio-generation"] },
  { name: "gpt-realtime-1.5", publisher: "OpenAI", tasks: ["audio-generation"] },
  { name: "FW-Kimi-K2.5", publisher: "Fireworks", tasks: ["chat-completion"] },
  { name: "DeepSeek-V3.2", publisher: "DeepSeek", tasks: ["chat-completion"] },
  { name: "qwen-qwen3.5-35b-a3b", publisher: "Hugging Face", tasks: ["chat-completion"] },
  { name: "gpt-5.2-chat", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "mistral-document-ai-2512", publisher: "Mistral AI", tasks: ["image-to-text"] },
  { name: "gpt-5.2-codex", publisher: "OpenAI", tasks: ["responses"] },
  { name: "FW-DeepSeek-V3.2", publisher: "Fireworks", tasks: ["chat-completion"] },
  { name: "DeepSeek-V3.2-Speciale", publisher: "DeepSeek", tasks: ["chat-completion"] },
  { name: "gpt-5.2", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "Cohere-rerank-v4.0-pro", publisher: "Cohere", tasks: ["text-classification"] },
  { name: "Cohere-rerank-v4.0-fast", publisher: "Cohere", tasks: ["text-classification"] },
  { name: "Kimi-K2-Thinking", publisher: "Moonshot AI", tasks: ["chat-completion"] },
  { name: "gpt-5.1-codex-max", publisher: "OpenAI", tasks: ["responses"] },
  { name: "claude-opus-4-5", publisher: "Anthropic", tasks: ["messages"] },
  { name: "claude-sonnet-4-5", publisher: "Anthropic", tasks: ["messages"] },
  { name: "gpt-5.1", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-5.1-codex", publisher: "OpenAI", tasks: ["responses"] },
  { name: "DeepSeek-V3.1", publisher: "DeepSeek", tasks: ["chat-completion"] },
  { name: "Mistral-Large-3", publisher: "Mistral AI", tasks: ["chat-completion"] },
  { name: "gpt-5-chat", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "claude-haiku-4-5", publisher: "Anthropic", tasks: ["messages"] },
  { name: "claude-opus-4-1", publisher: "Anthropic", tasks: ["messages"] },
  { name: "grok-4", publisher: "xAI", tasks: ["chat-completion"] },
  { name: "sora-2", publisher: "OpenAI", tasks: ["video-generation"] },
  { name: "embed-v-4-0", publisher: "Cohere", tasks: ["embeddings", "summarization"] },
  { name: "gpt-5.1-chat", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-5.1-codex-mini", publisher: "OpenAI", tasks: ["responses"] },
  { name: "grok-4-fast-reasoning", publisher: "xAI", tasks: ["chat-completion"] },
  { name: "gpt-5-pro", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "Llama-4-Maverick-17B-128E-Instruct-FP8", publisher: "Meta", tasks: ["chat-completion"] },
  { name: "gpt-5", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "DeepSeek-V3-0324", publisher: "DeepSeek", tasks: ["chat-completion"] },
  { name: "gpt-4.1", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-4.1-mini", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "grok-4-fast-non-reasoning", publisher: "xAI", tasks: ["chat-completion"] },
  { name: "gpt-4o-transcribe-diarize", publisher: "OpenAI", tasks: ["speech-to-text"] },
  { name: "Flux.1-Kontext-pro", publisher: "Black Forest Labs", tasks: ["text-to-image", "image-to-image"] },
  { name: "gpt-5-codex", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "Flux-1.1-Pro", publisher: "Black Forest Labs", tasks: ["text-to-image"] },
  { name: "o3", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-realtime-mini", publisher: "OpenAI", tasks: ["audio-generation"] },
  { name: "gpt-5-nano", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-5-mini", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "DeepSeek-R1-0528", publisher: "DeepSeek", tasks: ["chat-completion"] },
  { name: "grok-3", publisher: "xAI", tasks: ["chat-completion"] },
  { name: "MAI-DS-R1", publisher: "Microsoft", tasks: ["chat-completion"] },
  { name: "o4-mini", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-4.1-nano", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "grok-code-fast-1", publisher: "xAI", tasks: ["chat-completion"] },
  { name: "mistral-document-ai-2505", publisher: "Mistral AI", tasks: ["image-to-text"] },
  { name: "o3-mini", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-audio-mini", publisher: "OpenAI", tasks: ["audio-generation"] },
  { name: "gpt-oss-120B", publisher: "OpenAI", tasks: ["chat-completion"] },
  { name: "grok-3-mini", publisher: "xAI", tasks: ["chat-completion"] },
  { name: "Llama-3.3-70B-Instruct", publisher: "Meta", tasks: ["chat-completion"] },
  { name: "gpt-realtime", publisher: "OpenAI", tasks: ["audio-generation"] },
  { name: "gpt-audio", publisher: "OpenAI", tasks: ["audio-generation"] },
  { name: "DeepSeek-V3", publisher: "DeepSeek", tasks: ["chat-completion"] },
  { name: "mistral-medium-2505", publisher: "Mistral AI", tasks: ["chat-completion", "image-classification"] },
  { name: "o3-deep-research", publisher: "OpenAI", tasks: ["data-generation"] },
  { name: "codex-mini", publisher: "OpenAI", tasks: ["responses"] },
  { name: "gpt-4.5-preview", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-oss-safeguard-120b", publisher: "OpenAI", tasks: ["chat-completion"] },
  { name: "gpt-oss-safeguard-20b", publisher: "OpenAI", tasks: ["chat-completion"] },
  { name: "gpt-oss-20b", publisher: "OpenAI", tasks: ["chat-completion"] },
  { name: "o3-pro", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "sora", publisher: "OpenAI", tasks: ["video-generation"] },
  { name: "gpt-image-1", publisher: "OpenAI", tasks: ["text-to-image", "image-to-image"] },
  { name: "EvoDiff", publisher: "Microsoft", tasks: ["protein-sequence-generation"] },
  { name: "Phi-4-reasoning", publisher: "Microsoft", tasks: ["chat-completion"] },
  { name: "Phi-4-mini-reasoning", publisher: "Microsoft", tasks: ["chat-completion"] },
  { name: "Llama-4-Scout-17B-16E-Instruct", publisher: "Meta", tasks: ["chat-completion"] },
  { name: "cohere-command-a", publisher: "Cohere", tasks: ["chat-completion"] },
  { name: "Llama-4-Scout-17B-16E", publisher: "Meta", tasks: ["chat-completion"] },
  { name: "gpt-4o-mini-tts", publisher: "OpenAI", tasks: ["text-to-speech"] },
  { name: "gpt-4o-transcribe", publisher: "OpenAI", tasks: ["speech-to-text"] },
  { name: "gpt-4o-mini-transcribe", publisher: "OpenAI", tasks: ["speech-to-text"] },
  { name: "DeepSeek-R1", publisher: "DeepSeek", tasks: ["chat-completion"] },
  { name: "computer-use-preview", publisher: "OpenAI", tasks: ["responses"] },
  { name: "Phi-4-mini-instruct", publisher: "Microsoft", tasks: ["chat-completion"] },
  { name: "Phi-4-multimodal-instruct", publisher: "Microsoft", tasks: ["chat-completion"] },
  { name: "Phi-4", publisher: "Microsoft", tasks: ["chat-completion"] },
  { name: "mistral-ocr-2503", publisher: "Mistral AI", tasks: ["image-to-text"] },
  { name: "mistral-small-2503", publisher: "Mistral AI", tasks: ["chat-completion", "image-classification", "summarization", "text-classification", "text-generation", "translation"] },
  { name: "gpt-4o-mini-audio-preview", publisher: "OpenAI", tasks: ["audio-generation"] },
  { name: "gpt-4o-mini-realtime-preview", publisher: "OpenAI", tasks: ["audio-generation"] },
  { name: "o1", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "o1-mini", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-4o", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-4o-mini", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "gpt-4o-audio-preview", publisher: "OpenAI", tasks: ["audio-generation"] },
  { name: "gpt-4o-realtime-preview", publisher: "OpenAI", tasks: ["audio-generation"] },
  { name: "financial-reports-analysis-v2", publisher: "Microsoft", tasks: ["chat-completion"] },
  { name: "supply-chain-trade-regulations-v2", publisher: "Microsoft", tasks: ["chat-completion"] },
  { name: "Muse", publisher: "Microsoft", tasks: ["image-to-image"] },
  { name: "Cohere-rerank-v3.5", publisher: "Cohere", tasks: ["text-classification"] },
  { name: "Stable-Diffusion-3.5-Large", publisher: "Stability AI", tasks: ["text-to-image", "image-to-image"] },
  { name: "Stable-Image-Ultra", publisher: "Stability AI", tasks: ["text-to-image"] },
  { name: "Stable-Image-Core", publisher: "Stability AI", tasks: ["text-to-image"] },
  { name: "Gretel-Navigator-Tabular", publisher: "Gretel", tasks: ["chat-completion", "data-generation"] },
  { name: "o1-preview", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "tsuzumi-7b", publisher: "NTT Data", tasks: ["chat-completion"] },
  { name: "Bria-2.3-Fast", publisher: "Bria", tasks: ["text-to-image"] },
  { name: "Ministral-3B", publisher: "Mistral AI", tasks: ["chat-completion"] },
  { name: "Virchow", publisher: "Paige", tasks: ["image-feature-extraction"] },
  { name: "Virchow2", publisher: "Paige", tasks: ["image-feature-extraction"] },
  { name: "Prism", publisher: "Paige", tasks: ["zero-shot-image-classification"] },
  { name: "Cohere-embed-v3-multilingual", publisher: "Cohere", tasks: ["embeddings"] },
  { name: "gpt-4", publisher: "OpenAI", tasks: ["chat-completion", "responses"] },
  { name: "AI21-Jamba-1.5-Mini", publisher: "AI21 Labs", tasks: ["chat-completion"] },
  { name: "AI21-Jamba-1.5-Large", publisher: "AI21 Labs", tasks: ["chat-completion"] },
  { name: "Cohere-command-r-plus-08-2024", publisher: "Cohere", tasks: ["chat-completion"] },
  { name: "Cohere-command-r-08-2024", publisher: "Cohere", tasks: ["chat-completion"] },
  { name: "Cohere-rerank-v3-multilingual", publisher: "Cohere", tasks: ["text-classification"] },
  { name: "Cohere-rerank-v3-english", publisher: "Cohere", tasks: ["text-classification"] },
  { name: "snowflake-arctic-base", publisher: "Snowflake", tasks: ["text-generation"] },
  { name: "dall-e-3", publisher: "OpenAI", tasks: ["text-to-image"] },
  { name: "gpt-35-turbo", publisher: "OpenAI", tasks: ["chat-completion"] },
  { name: "gpt-35-turbo-instruct", publisher: "OpenAI", tasks: ["chat-completion"] },
  { name: "gpt-35-turbo-16k", publisher: "OpenAI", tasks: ["chat-completion"] },
  { name: "davinci-002", publisher: "OpenAI", tasks: ["completions"] },
  { name: "ibm-granite-granite-vision-4.1-4b", publisher: "Hugging Face", tasks: ["chat-completion"] },
  { name: "ibm-granite-granite-speech-4.1-2b", publisher: "Hugging Face", tasks: ["automatic-speech-recognition"] },
  // Live models with custom IDs
  { name: "Kimi-K2.6-1", publisher: "Moonshot AI", tasks: ["chat-completion"] },
  { name: "text-embedding-3-small", publisher: "OpenAI", tasks: ["embeddings"] },
];

function toDisplayName(name: string): string {
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .replace(/Gpt/g, "GPT")
    .replace(/Grok/g, "Grok")
    .replace(/Llama/g, "Llama")
    .replace(/Deepseek/g, "DeepSeek")
    .replace(/Mistral/g, "Mistral")
    .replace(/Cohere/g, "Cohere")
    .replace(/Claude/g, "Claude")
    .replace(/Phi/g, "Phi")
    .replace(/O1/g, "o1")
    .replace(/O3/g, "o3")
    .replace(/O4/g, "o4")
    .replace(/Dall e/g, "DALL-E")
    .replace(/Ai21/g, "AI21");
}

async function seed() {
  let inserted = 0;
  let updated = 0;

  for (const model of CATALOG) {
    const status = LIVE_MODELS.has(model.name) ? "live" : "available_on_request";
    const supportsVision = model.tasks.some(t => 
      ["image-to-text", "text-to-image", "image-to-image", "image-classification"].includes(t)
    );
    const supportsTools = model.tasks.some(t =>
      ["chat-completion", "messages", "responses"].includes(t)
    );
    const supportsJson = model.tasks.some(t =>
      ["chat-completion", "messages"].includes(t)
    );

    // Check if model already exists
    const existing = await db.select().from(models).where(
      and(eq(models.modelId, model.name), eq(models.providerId, AZURE_PROVIDER_ID))
    );

    if (existing.length > 0) {
      // Update status
      await db.update(models)
        .set({ deploymentStatus: status, updatedAt: new Date() })
        .where(and(eq(models.modelId, model.name), eq(models.providerId, AZURE_PROVIDER_ID)));
      updated++;
      continue;
    }

    await db.insert(models).values({
      providerId: AZURE_PROVIDER_ID,
      modelId: model.name,
      displayName: toDisplayName(model.name),
      ownedBy: model.publisher,
      supportsVision,
      supportsTools,
      supportsJsonMode: supportsJson,
      enabled: status === "live",
      deploymentStatus: status,
    });
    inserted++;
  }

  console.log(`✅ Done! Inserted: ${inserted}, Updated: ${updated}`);
  console.log(`📊 Total: ${inserted + updated} models`);
}

seed().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
