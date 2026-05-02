import type {
  ChatCompletionChunk,
  ChatMessage,
  UsageInfo,
} from "@opendoor/shared";

export function createChunk(
  id: string,
  model: string,
  delta: Partial<ChatMessage>,
  index: number = 0,
  finishReason: string | null = null
): ChatCompletionChunk {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index,
        delta,
        finish_reason: finishReason as any,
      },
    ],
  };
}

export function encodeSSE(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function encodeSSEDone(): string {
  return "data: [DONE]\n\n";
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
