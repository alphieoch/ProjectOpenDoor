import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";

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
}

export function generateId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
