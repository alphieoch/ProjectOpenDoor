import OpenAI from "openai";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";

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
      model: request.model,
      messages: request.messages as any,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      frequency_penalty: request.frequency_penalty,
      presence_penalty: request.presence_penalty,
      tools: request.tools as any,
      tool_choice: request.tool_choice as any,
      user: request.user,
      stream: false,
    });

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
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const stream = await this.client.chat.completions.create({
      model: request.model,
      messages: request.messages as any,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      frequency_penalty: request.frequency_penalty,
      presence_penalty: request.presence_penalty,
      tools: request.tools as any,
      tool_choice: request.tool_choice as any,
      user: request.user,
      stream: true,
    });

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

  async listModels(): Promise<ModelInfo[]> {
    const models = await this.client.models.list();
    return models.data
      .filter((m) => m.id.startsWith("gpt") || m.id.startsWith("o1"))
      .map((m) => ({
        id: m.id,
        object: "model" as const,
        created: m.created || 0,
        owned_by: m.owned_by || "openai",
        provider: this.slug,
      }));
  }
}
