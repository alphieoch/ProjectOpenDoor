import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";

interface AzureDeployment {
  id: string;
  model: string;
  owner: string;
  status: string;
  created_at: number;
  capabilities?: {
    chat_completion?: boolean;
    completions?: boolean;
    embeddings?: boolean;
  };
}

/**
 * Comprehensive static catalog of ALL major Azure-supported models.
 * Merged with dynamically discovered deployments from Azure OpenAI.
 */
const AZURE_MODEL_CATALOG: ModelInfo[] = [
  // OpenAI GPT family
  { id: "gpt-5.4", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.4", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.4-pro", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.4 Pro", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.4-mini", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.4 Mini", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.4-nano", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.4 Nano", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.3-chat", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.3 Chat", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.3-codex", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.3 Codex", context_window: 256000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.2", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.2", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.2-chat", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.2 Chat", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.2-codex", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.2 Codex", context_window: 256000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.1", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.1", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.1-chat", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.1 Chat", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.1-codex", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.1 Codex", context_window: 256000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.1-codex-max", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.1 Codex Max", context_window: 256000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5.1-codex-mini", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5.1 Codex Mini", context_window: 256000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5-pro", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5 Pro", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5-nano", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5 Nano", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5-mini", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5 Mini", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5-codex", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5 Codex", context_window: 256000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "gpt-5-chat", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-5 Chat", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-4.5-preview", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4.5 Preview", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-4.1", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4.1", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-4.1-mini", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4.1 Mini", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-4.1-nano", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4.1 Nano", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-4o", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4o", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-4o-mini", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4o Mini", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-4-turbo", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4 Turbo", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "gpt-4", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4", context_window: 8192, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "gpt-35-turbo", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-3.5 Turbo", context_window: 16385, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "gpt-35-turbo-16k", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-3.5 Turbo 16K", context_window: 16385, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "gpt-35-turbo-instruct", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-3.5 Turbo Instruct", context_window: 4096, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // OpenAI reasoning
  { id: "o3", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "o3", context_window: 200000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "o3-pro", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "o3 Pro", context_window: 200000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "o3-mini", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "o3-mini", context_window: 200000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "o3-deep-research", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "o3 Deep Research", context_window: 200000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "o4-mini", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "o4-mini", context_window: 200000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "o1", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "o1", context_window: 200000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "o1-mini", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "o1-mini", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "o1-preview", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "o1-preview", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  // OpenAI embeddings
  { id: "text-embedding-3-large", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "Text Embedding 3 Large", context_window: 8192, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "text-embedding-3-small", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "Text Embedding 3 Small", context_window: 8192, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "text-embedding-ada-002", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "Text Embedding Ada 002", context_window: 8192, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // OpenAI images & audio
  { id: "dall-e-3", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "DALL-E 3", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "dall-e-2", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "DALL-E 2", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-image-1", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT Image 1", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-image-2", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT Image 2", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "sora", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "Sora", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "sora-2", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "Sora 2", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "whisper", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "Whisper", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-4o-transcribe", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4o Transcribe", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-4o-mini-transcribe", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4o Mini Transcribe", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-4o-mini-tts", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-4o Mini TTS", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-audio", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT Audio", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-audio-mini", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT Audio Mini", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-audio-1.5", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT Audio 1.5", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-realtime", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT Realtime", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-realtime-mini", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT Realtime Mini", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-realtime-1.5", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT Realtime 1.5", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // OpenAI OSS
  { id: "gpt-oss-120B", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-OSS 120B", context_window: 128000, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "gpt-oss-20b", object: "model", created: 0, owned_by: "openai", provider: "azure-foundry", display_name: "GPT-OSS 20B", context_window: 128000, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // Anthropic Claude
  { id: "claude-opus-4-7", object: "model", created: 0, owned_by: "anthropic", provider: "azure-foundry", display_name: "Claude Opus 4.7", context_window: 200000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "claude-opus-4-6", object: "model", created: 0, owned_by: "anthropic", provider: "azure-foundry", display_name: "Claude Opus 4.6", context_window: 200000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "claude-opus-4-5", object: "model", created: 0, owned_by: "anthropic", provider: "azure-foundry", display_name: "Claude Opus 4.5", context_window: 200000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "claude-opus-4-1", object: "model", created: 0, owned_by: "anthropic", provider: "azure-foundry", display_name: "Claude Opus 4.1", context_window: 200000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "claude-sonnet-4-6", object: "model", created: 0, owned_by: "anthropic", provider: "azure-foundry", display_name: "Claude Sonnet 4.6", context_window: 200000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "claude-sonnet-4-5", object: "model", created: 0, owned_by: "anthropic", provider: "azure-foundry", display_name: "Claude Sonnet 4.5", context_window: 200000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "claude-haiku-4-5", object: "model", created: 0, owned_by: "anthropic", provider: "azure-foundry", display_name: "Claude Haiku 4.5", context_window: 200000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  // xAI Grok
  { id: "grok-4", object: "model", created: 0, owned_by: "xai", provider: "azure-foundry", display_name: "Grok 4", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "grok-4-20-reasoning", object: "model", created: 0, owned_by: "xai", provider: "azure-foundry", display_name: "Grok 4 Reasoning", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "grok-4-20-non-reasoning", object: "model", created: 0, owned_by: "xai", provider: "azure-foundry", display_name: "Grok 4 Non-Reasoning", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "grok-4-fast-reasoning", object: "model", created: 0, owned_by: "xai", provider: "azure-foundry", display_name: "Grok 4 Fast Reasoning", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "grok-4-fast-non-reasoning", object: "model", created: 0, owned_by: "xai", provider: "azure-foundry", display_name: "Grok 4 Fast Non-Reasoning", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "grok-3", object: "model", created: 0, owned_by: "xai", provider: "azure-foundry", display_name: "Grok 3", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "grok-3-mini", object: "model", created: 0, owned_by: "xai", provider: "azure-foundry", display_name: "Grok 3 Mini", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "grok-code-fast-1", object: "model", created: 0, owned_by: "xai", provider: "azure-foundry", display_name: "Grok Code Fast", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  // Meta Llama
  { id: "Llama-4-Maverick-17B-128E-Instruct-FP8", object: "model", created: 0, owned_by: "meta", provider: "azure-foundry", display_name: "Llama 4 Maverick", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "Llama-4-Scout-17B-16E-Instruct", object: "model", created: 0, owned_by: "meta", provider: "azure-foundry", display_name: "Llama 4 Scout", context_window: 256000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "Llama-3.3-70B-Instruct", object: "model", created: 0, owned_by: "meta", provider: "azure-foundry", display_name: "Llama 3.3 70B", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "llama-3-1-405b-instruct", object: "model", created: 0, owned_by: "meta", provider: "azure-foundry", display_name: "Llama 3.1 405B", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "llama-3-1-70b-instruct", object: "model", created: 0, owned_by: "meta", provider: "azure-foundry", display_name: "Llama 3.1 70B", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  // Mistral
  { id: "Mistral-Large-3", object: "model", created: 0, owned_by: "mistral", provider: "azure-foundry", display_name: "Mistral Large 3", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "mistral-large-latest", object: "model", created: 0, owned_by: "mistral", provider: "azure-foundry", display_name: "Mistral Large", context_window: 32000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "mistral-small-latest", object: "model", created: 0, owned_by: "mistral", provider: "azure-foundry", display_name: "Mistral Small", context_window: 32000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "mistral-medium-2505", object: "model", created: 0, owned_by: "mistral", provider: "azure-foundry", display_name: "Mistral Medium 2505", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "mistral-small-2503", object: "model", created: 0, owned_by: "mistral", provider: "azure-foundry", display_name: "Mistral Small 2503", context_window: 32000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "mistral-ocr-2503", object: "model", created: 0, owned_by: "mistral", provider: "azure-foundry", display_name: "Mistral OCR 2503", context_window: 32000, supports_vision: true, supports_tools: false, supports_json_mode: false },
  { id: "mistral-ocr-2505", object: "model", created: 0, owned_by: "mistral", provider: "azure-foundry", display_name: "Mistral OCR 2505", context_window: 32000, supports_vision: true, supports_tools: false, supports_json_mode: false },
  { id: "mistral-document-ai-2512", object: "model", created: 0, owned_by: "mistral", provider: "azure-foundry", display_name: "Mistral Document AI 2512", context_window: 32000, supports_vision: true, supports_tools: false, supports_json_mode: false },
  { id: "Ministral-3B", object: "model", created: 0, owned_by: "mistral", provider: "azure-foundry", display_name: "Ministral 3B", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  // Cohere
  { id: "cohere-command-a", object: "model", created: 0, owned_by: "cohere", provider: "azure-foundry", display_name: "Cohere Command A", context_window: 256000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "command-r-plus", object: "model", created: 0, owned_by: "cohere", provider: "azure-foundry", display_name: "Command R+", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "command-r", object: "model", created: 0, owned_by: "cohere", provider: "azure-foundry", display_name: "Command R", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "Cohere-command-r-plus-08-2024", object: "model", created: 0, owned_by: "cohere", provider: "azure-foundry", display_name: "Command R+ 08-2024", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "Cohere-command-r-08-2024", object: "model", created: 0, owned_by: "cohere", provider: "azure-foundry", display_name: "Command R 08-2024", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "embed-v-4-0", object: "model", created: 0, owned_by: "cohere", provider: "azure-foundry", display_name: "Cohere Embed v4", context_window: 512, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "Cohere-embed-v3-multilingual", object: "model", created: 0, owned_by: "cohere", provider: "azure-foundry", display_name: "Cohere Embed v3 Multilingual", context_window: 512, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // DeepSeek
  { id: "DeepSeek-V3.2", object: "model", created: 0, owned_by: "deepseek", provider: "azure-foundry", display_name: "DeepSeek V3.2", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "DeepSeek-V3.2-Speciale", object: "model", created: 0, owned_by: "deepseek", provider: "azure-foundry", display_name: "DeepSeek V3.2 Speciale", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "DeepSeek-V3.1", object: "model", created: 0, owned_by: "deepseek", provider: "azure-foundry", display_name: "DeepSeek V3.1", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "DeepSeek-V3", object: "model", created: 0, owned_by: "deepseek", provider: "azure-foundry", display_name: "DeepSeek V3", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "DeepSeek-V3-0324", object: "model", created: 0, owned_by: "deepseek", provider: "azure-foundry", display_name: "DeepSeek V3 0324", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "DeepSeek-R1", object: "model", created: 0, owned_by: "deepseek", provider: "azure-foundry", display_name: "DeepSeek R1", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "DeepSeek-R1-0528", object: "model", created: 0, owned_by: "deepseek", provider: "azure-foundry", display_name: "DeepSeek R1 0528", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "DeepSeek-V4-Flash", object: "model", created: 0, owned_by: "deepseek", provider: "azure-foundry", display_name: "DeepSeek V4 Flash", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "DeepSeek-V4-Pro", object: "model", created: 0, owned_by: "deepseek", provider: "azure-foundry", display_name: "DeepSeek V4 Pro", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  // Microsoft Phi
  { id: "Phi-4", object: "model", created: 0, owned_by: "microsoft", provider: "azure-foundry", display_name: "Phi-4", context_window: 16000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "Phi-4-reasoning", object: "model", created: 0, owned_by: "microsoft", provider: "azure-foundry", display_name: "Phi-4 Reasoning", context_window: 16000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "Phi-4-mini-reasoning", object: "model", created: 0, owned_by: "microsoft", provider: "azure-foundry", display_name: "Phi-4 Mini Reasoning", context_window: 16000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "Phi-4-mini-instruct", object: "model", created: 0, owned_by: "microsoft", provider: "azure-foundry", display_name: "Phi-4 Mini Instruct", context_window: 16000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "Phi-4-multimodal-instruct", object: "model", created: 0, owned_by: "microsoft", provider: "azure-foundry", display_name: "Phi-4 Multimodal Instruct", context_window: 16000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "MAI-DS-R1", object: "model", created: 0, owned_by: "microsoft", provider: "azure-foundry", display_name: "MAI-DS-R1", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  // Moonshot AI Kimi
  { id: "Kimi-K2.6", object: "model", created: 0, owned_by: "moonshot", provider: "azure-foundry", display_name: "Kimi K2.6", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "Kimi-K2.6-1", object: "model", created: 0, owned_by: "moonshot", provider: "azure-foundry", display_name: "Kimi K2.6 (Custom)", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "Kimi-K2.5", object: "model", created: 0, owned_by: "moonshot", provider: "azure-foundry", display_name: "Kimi K2.5", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  { id: "Kimi-K2-Thinking", object: "model", created: 0, owned_by: "moonshot", provider: "azure-foundry", display_name: "Kimi K2 Thinking", context_window: 128000, supports_vision: true, supports_tools: true, supports_json_mode: true },
  // AI21
  { id: "AI21-Jamba-1.5-Large", object: "model", created: 0, owned_by: "ai21", provider: "azure-foundry", display_name: "AI21 Jamba 1.5 Large", context_window: 256000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "AI21-Jamba-1.5-Mini", object: "model", created: 0, owned_by: "ai21", provider: "azure-foundry", display_name: "AI21 Jamba 1.5 Mini", context_window: 256000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  // Stability AI
  { id: "Stable-Diffusion-3.5-Large", object: "model", created: 0, owned_by: "stability", provider: "azure-foundry", display_name: "Stable Diffusion 3.5 Large", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "Stable-Image-Ultra", object: "model", created: 0, owned_by: "stability", provider: "azure-foundry", display_name: "Stable Image Ultra", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "Stable-Image-Core", object: "model", created: 0, owned_by: "stability", provider: "azure-foundry", display_name: "Stable Image Core", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // Black Forest Labs
  { id: "Flux.1-Kontext-pro", object: "model", created: 0, owned_by: "blackforest", provider: "azure-foundry", display_name: "Flux.1 Kontext Pro", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "Flux-1.1-Pro", object: "model", created: 0, owned_by: "blackforest", provider: "azure-foundry", display_name: "Flux 1.1 Pro", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // Microsoft MAI
  { id: "MAI-Image-2", object: "model", created: 0, owned_by: "microsoft", provider: "azure-foundry", display_name: "MAI Image 2", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "MAI-Image-2e", object: "model", created: 0, owned_by: "microsoft", provider: "azure-foundry", display_name: "MAI Image 2e", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "MAI-Voice-1", object: "model", created: 0, owned_by: "microsoft", provider: "azure-foundry", display_name: "MAI Voice 1", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "MAI-Transcribe-1", object: "model", created: 0, owned_by: "microsoft", provider: "azure-foundry", display_name: "MAI Transcribe 1", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // NTT Data
  { id: "tsuzumi-7b", object: "model", created: 0, owned_by: "ntt", provider: "azure-foundry", display_name: "Tsuzumi 7B", context_window: 32000, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // Snowflake
  { id: "snowflake-arctic-base", object: "model", created: 0, owned_by: "snowflake", provider: "azure-foundry", display_name: "Snowflake Arctic", context_window: 128000, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // Fireworks
  { id: "FW-MiniMax-M2.5", object: "model", created: 0, owned_by: "fireworks", provider: "azure-foundry", display_name: "Fireworks MiniMax M2.5", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "FW-GLM-5", object: "model", created: 0, owned_by: "fireworks", provider: "azure-foundry", display_name: "Fireworks GLM-5", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "FW-GPT-OSS-120B", object: "model", created: 0, owned_by: "fireworks", provider: "azure-foundry", display_name: "Fireworks GPT-OSS 120B", context_window: 128000, supports_vision: false, supports_tools: false, supports_json_mode: false },
  { id: "FW-DeepSeek-V3.2", object: "model", created: 0, owned_by: "fireworks", provider: "azure-foundry", display_name: "Fireworks DeepSeek V3.2", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  { id: "FW-Kimi-K2.5", object: "model", created: 0, owned_by: "fireworks", provider: "azure-foundry", display_name: "Fireworks Kimi K2.5", context_window: 128000, supports_vision: false, supports_tools: true, supports_json_mode: true },
  // Bria
  { id: "Bria-2.3-Fast", object: "model", created: 0, owned_by: "bria", provider: "azure-foundry", display_name: "Bria 2.3 Fast", context_window: 0, supports_vision: false, supports_tools: false, supports_json_mode: false },
  // Gretel
  { id: "Gretel-Navigator-Tabular", object: "model", created: 0, owned_by: "gretel", provider: "azure-foundry", display_name: "Gretel Navigator Tabular", context_window: 32000, supports_vision: false, supports_tools: false, supports_json_mode: false },
];

/**
 * Azure OpenAI Service provider.
 * Connects to Azure OpenAI or Azure AI Inference endpoints.
 *
 * Env vars:
 *   AZURE_AI_FOUNDRY_ENDPOINT  – required (e.g. https://my-resource.openai.azure.com)
 *   AZURE_AI_FOUNDRY_KEY       – required
 *   AZURE_INFERENCE_ENDPOINT   – optional (e.g. https://my-resource.cognitiveservices.azure.com)
 *   AZURE_INFERENCE_KEY        – optional
 */
export class AzureFoundryProvider implements ProviderAdapter {
  name = "Azure AI";
  slug = "azure-foundry";

  private endpoint: string;
  private apiKey: string;
  private inferenceEndpoint?: string;
  private inferenceKey?: string;
  private deployments: AzureDeployment[] = [];

  constructor(apiKey?: string) {
    const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
    const key = apiKey ?? process.env.AZURE_AI_FOUNDRY_KEY;
    if (!endpoint) throw new Error("AZURE_AI_FOUNDRY_ENDPOINT not set");
    if (!key) throw new Error("AZURE_AI_FOUNDRY_KEY not set");
    this.endpoint = endpoint.replace(/\/$/, "");
    this.apiKey = key;

    // Optional Azure AI Inference API (for serverless models)
    this.inferenceEndpoint = process.env.AZURE_INFERENCE_ENDPOINT?.replace(/\/$/, "");
    this.inferenceKey = process.env.AZURE_INFERENCE_KEY;
  }

  /**
   * Live deployment inventory from Azure OpenAI (for status page).
   * Always hits the Azure API; does not rely on listModels() cache.
   */
  async getLiveDeployments(): Promise<{ id: string; model: string; status: string }[]> {
    const deps = await this.fetchDeployments();
    return deps.map((d) => ({
      id: d.id,
      model: d.model || d.id,
      status: d.status || "unknown",
    }));
  }

  /** Discover deployed models from Azure OpenAI */
  private async fetchDeployments(): Promise<AzureDeployment[]> {
    try {
      const res = await fetch(
        `${this.endpoint}/openai/deployments?api-version=2023-03-15-preview`,
        {
          headers: { "api-key": this.apiKey },
        }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: AzureDeployment[] };
      return data.data || [];
    } catch {
      return [];
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // Cache deployments on first call
    if (this.deployments.length === 0) {
      this.deployments = await this.fetchDeployments();
    }

    const deployedIds = new Set(this.deployments.map((d) => d.id));

    // Start with the comprehensive static catalog
    const result = AZURE_MODEL_CATALOG.map((m) => ({
      ...m,
      // Mark deployed models with a special flag via display name
      display_name: deployedIds.has(m.id) ? `✅ ${m.display_name}` : m.display_name,
    }));

    // Add any dynamically discovered deployments not in static catalog
    for (const d of this.deployments) {
      if (!result.find((m) => m.id === d.id)) {
        result.push({
          id: d.id,
          object: "model",
          created: d.created_at || 0,
          owned_by: d.owner || "azure-openai",
          provider: this.slug,
          display_name: `✅ ${d.model || d.id}`,
          context_window: 128000,
          supports_vision: false,
          supports_tools: false,
          supports_json_mode: false,
        });
      }
    }

    return result;
  }

  /** Build request body, forwarding every field Azure supports */
  private buildBody(request: ChatCompletionRequest, stream: boolean): unknown {
    const body: Record<string, unknown> = {
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 2048,
      top_p: request.top_p ?? 1,
      frequency_penalty: request.frequency_penalty ?? 0,
      presence_penalty: request.presence_penalty ?? 0,
      stream,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      if (request.tool_choice) body.tool_choice = request.tool_choice;
    }
    if (request.user) body.user = request.user;
    if (request.response_format) body.response_format = request.response_format;

    // Azure AI Inference API requires model in body; Azure OpenAI ignores it
    body.model = request.model;

    return body;
  }

  /** Choose the best endpoint for a given model */
  private getUrl(request: ChatCompletionRequest): string {
    return `${this.endpoint}/openai/deployments/${request.model}/chat/completions?api-version=2024-12-01-preview`;
  }

  private getAuth(): string {
    return this.apiKey;
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const url = this.getUrl(request);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.getAuth(),
      },
      body: JSON.stringify(this.buildBody(request, false)),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Azure error [${response.status}]: ${text}`);
    }

    const data = (await response.json()) as any;
    return {
      id: data.id || generateId(),
      object: "chat.completion",
      created: data.created || Math.floor(Date.now() / 1000),
      model: data.model || request.model,
      choices: data.choices.map((c: any) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content,
          tool_calls: c.message.tool_calls,
          tool_call_id: c.message.tool_call_id,
        },
        finish_reason: c.finish_reason,
      })),
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const url = this.getUrl(request);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.getAuth(),
      },
      body: JSON.stringify(this.buildBody(request, true)),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Azure error [${response.status}]`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const chunk = JSON.parse(data);
            yield {
              id: chunk.id || generateId(),
              object: "chat.completion.chunk",
              created: chunk.created || Math.floor(Date.now() / 1000),
              model: chunk.model || request.model,
              choices: chunk.choices.map((c: any) => ({
                index: c.index || 0,
                delta: {
                  role: c.delta?.role,
                  content: c.delta?.content,
                  tool_calls: c.delta?.tool_calls,
                  tool_call_id: c.delta?.tool_call_id,
                },
                finish_reason: c.finish_reason || null,
              })),
            };
          } catch {
            // ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
