import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
  RerankRequest,
  RerankResult,
} from "@opendoor/shared";

export interface EmbeddingResult {
  data: Array<{ object: "embedding"; embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

export interface ProviderAdapter {
  name: string;
  slug: string;
  chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse>;
  chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown>;
  listModels(): Promise<ModelInfo[]>;
  /** Optional — OpenAI-compatible embeddings */
  createEmbedding?(opts: {
    model: string;
    input: string | string[];
    encoding_format?: string;
    dimensions?: number;
  }): Promise<EmbeddingResult>;
  createRerank?(request: RerankRequest): Promise<RerankResult>;
}

export function generateId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
