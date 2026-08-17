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
 * Perplexity Sonar — OpenAI-compatible (substitute for Vertex).
 * Set PERPLEXITY_API_KEY. Optional PERPLEXITY_BASE_URL.
 */
export class PerplexityProvider implements ProviderAdapter {
  name = "Perplexity";
  slug = "perplexity";
  private baseUrl: string;
  private apiKey: string;

  static readonly MODELS = [
    "sonar",
    "sonar-pro",
    "sonar-reasoning",
    "sonar-reasoning-pro",
  ] as const;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.PERPLEXITY_API_KEY ?? "";
    this.baseUrl = (process.env.PERPLEXITY_BASE_URL || "https://api.perplexity.ai").replace(
      /\/$/,
      ""
    );
  }

  private requireKey(): string {
    if (!this.apiKey) {
      throw new Error(
        "Perplexity is not configured. Set PERPLEXITY_API_KEY or add an org BYOK key for provider 'perplexity'."
      );
    }
    return this.apiKey;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.requireKey()}`,
      },
      body: JSON.stringify(openaiChatPayload(request, false)),
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status} ${await response.text()}`);
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
      body: JSON.stringify(openaiChatPayload(request, true)),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Perplexity API error: ${response.status}`);
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
    return PerplexityProvider.MODELS.map((id) => ({
      id,
      object: "model" as const,
      created: 0,
      owned_by: "perplexity",
      provider: this.slug,
      display_name: id,
    }));
  }
}
