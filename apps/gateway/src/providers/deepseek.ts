import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";
import { openaiChatPayload } from "./openai-body.js";

export class DeepSeekProvider implements ProviderAdapter {
  name = "DeepSeek";
  slug = "deepseek";
  private baseUrl = "https://api.deepseek.com/v1";
  private apiKey: string | null;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || null;
  }

  /** DeepSeek retired `deepseek-coder`; the chat model covers code + general. */
  private upstreamModel(modelId: string): string {
    if (modelId === "deepseek-coder") return "deepseek-chat";
    return modelId;
  }

  private requireKey(): string {
    if (!this.apiKey) {
      throw new Error(
        "DeepSeek is not configured. Set DEEPSEEK_API_KEY, or pick a local model such as llama3.2:3b.",
      );
    }
    return this.apiKey;
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const apiKey = this.requireKey();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openaiChatPayload({ ...request, model: this.upstreamModel(request.model) }, false)),
    });

    if (!response.ok) {
      throw new Error(
        `DeepSeek API error: ${response.status} ${await response.text()}`
      );
    }

    const data = (await response.json()) as any;
    return {
      id: data.id || generateId(),
      object: "chat.completion",
      created: data.created || Math.floor(Date.now() / 1000),
      model: data.model,
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
    const apiKey = this.requireKey();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openaiChatPayload({ ...request, model: this.upstreamModel(request.model) }, true)),
    });

    if (!response.ok || !response.body) {
      throw new Error(`DeepSeek API error: ${response.status}`);
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
    return [
      {
        id: "deepseek-chat",
        object: "model",
        created: 0,
        owned_by: "deepseek",
        provider: this.slug,
        display_name: "DeepSeek V2.5",
      },
      {
        id: "deepseek-coder",
        object: "model",
        created: 0,
        owned_by: "deepseek",
        provider: this.slug,
        display_name: "DeepSeek Coder V2",
      },
    ];
  }
}
