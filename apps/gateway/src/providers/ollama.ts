import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

export class OllamaProvider implements ProviderAdapter {
  name = "Local GPU (Ollama)";
  slug = "ollama";

  private async chat(request: ChatCompletionRequest, stream: boolean) {
    const response = await fetch(`${OLLAMA_HOST}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...request,
        model: request.model.replace(/^ollama:/, ""),
        stream,
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama error: ${await response.text()}`);
    }
    return response;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await this.chat(request, false);
    const data = await response.json();
    return {
      id: data.id || generateId(),
      object: "chat.completion",
      created: data.created || Math.floor(Date.now() / 1000),
      model: request.model,
      choices: data.choices || [],
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const response = await this.chat(request, true);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

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
            model: request.model,
            choices: chunk.choices || [],
          };
        } catch {
          /* skip */
        }
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: Array<{ name?: string }> };
      return (data.models || [])
        .filter((m) => m.name)
        .map((m) => ({
          id: m.name as string,
          object: "model" as const,
          created: Math.floor(Date.now() / 1000),
          owned_by: "ollama",
          provider: this.slug,
          display_name: `${m.name} (this Mac)`,
        }));
    } catch {
      return [];
    }
  }
}
