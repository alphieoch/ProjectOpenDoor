import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";
import { openaiChatPayload } from "./openai-body.js";

/**
 * Cerebras Inference — OpenAI-compatible.
 * Set CEREBRAS_API_KEY. Optional CEREBRAS_BASE_URL.
 */
export class CerebrasProvider implements ProviderAdapter {
  name = "Cerebras";
  slug = "cerebras";
  private baseUrl: string;
  private apiKey: string;

  static readonly MODEL_MAP: Record<string, string> = {
    "llama3.1-8b": "llama3.1-8b",
    "llama-3.3-70b": "llama-3.3-70b",
    "llama-4-scout-17b-16e-instruct": "llama-4-scout-17b-16e-instruct",
    "qwen-3-32b": "qwen-3-32b",
    "gpt-oss-120b": "gpt-oss-120b",
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.CEREBRAS_API_KEY ?? "";
    this.baseUrl = (process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1").replace(
      /\/$/,
      ""
    );
  }

  private requireKey(): string {
    if (!this.apiKey) {
      throw new Error(
        "Cerebras is not configured. Set CEREBRAS_API_KEY or add an org BYOK key for provider 'cerebras'."
      );
    }
    return this.apiKey;
  }

  private upstreamModel(modelId: string): string {
    return CerebrasProvider.MODEL_MAP[modelId] || modelId;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.requireKey()}`,
      },
      body: JSON.stringify(
        openaiChatPayload({ ...request, model: this.upstreamModel(request.model) }, false)
      ),
    });

    if (!response.ok) {
      throw new Error(`Cerebras API error: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as any;
    return {
      id: data.id || generateId(),
      object: "chat.completion",
      created: data.created || Math.floor(Date.now() / 1000),
      model: request.model,
      choices: data.choices.map((c: any) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content,
          tool_calls: c.message.tool_calls,
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
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.requireKey()}`,
      },
      body: JSON.stringify(
        openaiChatPayload({ ...request, model: this.upstreamModel(request.model) }, true)
      ),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Cerebras API error: ${response.status}`);
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
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") return;

          try {
            const chunk = JSON.parse(payload);
            yield {
              id: chunk.id || generateId(),
              object: "chat.completion.chunk",
              created: chunk.created || Math.floor(Date.now() / 1000),
              model: request.model,
              choices: chunk.choices.map((c: any) => ({
                index: c.index || 0,
                delta: {
                  role: c.delta?.role,
                  content: c.delta?.content,
                  tool_calls: c.delta?.tool_calls,
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

  async listModels(): Promise<ModelInfo[]> {
    return Object.keys(CerebrasProvider.MODEL_MAP).map((id) => ({
      id,
      object: "model" as const,
      created: 0,
      owned_by: "cerebras",
      provider: this.slug,
      display_name: id,
    }));
  }
}
