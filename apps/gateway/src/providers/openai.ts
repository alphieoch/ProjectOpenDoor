import OpenAI from "openai";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";
import { openaiChatPayload } from "./openai-body.js";
import { normalizeUsage } from "../utils/usage.js";

export class OpenAIProvider implements ProviderAdapter {
  name = "OpenAI";
  slug = "openai";
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    this.client = new OpenAI({ apiKey });
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const response = await this.client.chat.completions.create({
      ...openaiChatPayload(request, false),
    } as any);

    return {
      id: response.id,
      object: "chat.completion",
      created: response.created,
      model: response.model,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: {
          role: c.message.role as any,
          content: c.message.content || "",
          tool_calls: c.message.tool_calls as any,
        },
        finish_reason: c.finish_reason as any,
      })),
      usage: normalizeUsage(response.usage),
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const stream = await this.client.chat.completions.create({
      ...openaiChatPayload(request, true),
    } as any);

    for await (const chunk of stream) {
      yield {
        id: chunk.id,
        object: "chat.completion.chunk",
        created: chunk.created,
        model: chunk.model,
        choices: chunk.choices.map((c) => ({
          index: c.index,
          delta: {
            role: c.delta.role as any,
            content: c.delta.content || undefined,
            tool_calls: c.delta.tool_calls as any,
          },
          finish_reason: c.finish_reason as any,
        })),
      };
    }
  }

  async createEmbedding(opts: {
    model: string;
    input: string | string[];
    encoding_format?: string;
    dimensions?: number;
  }) {
    const response = await this.client.embeddings.create({
      model: opts.model,
      input: opts.input,
      encoding_format: (opts.encoding_format as any) || "float",
      dimensions: opts.dimensions,
    });
    return {
      data: response.data.map((d) => ({
        object: "embedding" as const,
        embedding: d.embedding,
        index: d.index,
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const models = await this.client.models.list();
    return models.data
      .filter((m) => m.id.startsWith("gpt") || m.id.startsWith("o1") || m.id.includes("embedding"))
      .map((m) => ({
        id: m.id,
        object: "model" as const,
        created: m.created || 0,
        owned_by: m.owned_by || "openai",
        provider: this.slug,
      }));
  }
}
