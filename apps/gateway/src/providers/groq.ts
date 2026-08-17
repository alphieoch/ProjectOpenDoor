import OpenAI from "openai";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import { isProductionRuntime } from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";
import { openaiChatPayload } from "./openai-body.js";
import { normalizeUsage } from "../utils/usage.js";

export class GroqProvider implements ProviderAdapter {
  name = "Groq";
  slug = "groq";
  private client: OpenAI | null = null;

  static readonly MODEL_MAP: Record<string, string> = {
    "llama-3.1-8b-instant": "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile": "llama-3.3-70b-versatile",
    "llama-3.1-8b-instruct": "llama-3.1-8b-instant",
    "llama-3.1-70b-instruct": "llama-3.3-70b-versatile",
    "mixtral-8x7b-32768": "mixtral-8x7b-32768",
    "whisper-large-v3": "whisper-large-v3",
  };

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GROQ_API_KEY;
    if (key) {
      this.client = new OpenAI({
        apiKey: key,
        baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      });
    }
  }

  private requireClient(): OpenAI {
    if (!this.client) {
      throw new Error(
        "Groq is not configured. Set GROQ_API_KEY or add an org BYOK key for provider 'groq'."
      );
    }
    return this.client;
  }

  private upstreamModel(modelId: string): string {
    return GroqProvider.MODEL_MAP[modelId] || modelId;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const client = this.requireClient();
    const model = this.upstreamModel(request.model);
    const response = await client.chat.completions.create({
      ...openaiChatPayload(request, false, model),
    } as any);

    return {
      id: response.id,
      object: "chat.completion",
      created: response.created,
      model: request.model,
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
    const client = this.requireClient();
    const model = this.upstreamModel(request.model);
    const stream = (await client.chat.completions.create({
      ...openaiChatPayload(request, true, model),
    } as any)) as unknown as AsyncIterable<any>;

    for await (const chunk of stream) {
      yield {
        id: chunk.id || generateId(),
        object: "chat.completion.chunk",
        created: chunk.created || Math.floor(Date.now() / 1000),
        model: request.model,
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

  async listModels(): Promise<ModelInfo[]> {
    if (!this.client && isProductionRuntime()) return [];
    return Object.keys(GroqProvider.MODEL_MAP)
      .filter((id) => !id.endsWith("-instruct") || id.includes("instant") || id.includes("versatile"))
      .filter((id) => id === "llama-3.1-8b-instant" || id === "llama-3.3-70b-versatile" || id === "mixtral-8x7b-32768" || id === "whisper-large-v3")
      .map((id) => ({
        id,
        object: "model" as const,
        created: Math.floor(Date.now() / 1000),
        owned_by: "groq",
        provider: this.slug,
        display_name: id,
      }));
  }
}
