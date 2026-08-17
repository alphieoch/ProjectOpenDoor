import OpenAI from "openai";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
  RerankRequest,
  RerankResult,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";
import { openaiChatPayload } from "./openai-body.js";
import { documentText } from "./content.js";
import { normalizeUsage } from "../utils/usage.js";
import { isProductionRuntime } from "@opendoor/shared";

/**
 * Optional Together overflow for legacy serverless ids (OpenAI-compatible).
 * Primary wholesale path is Vertex Model Garden (`vertex.ts`).
 */
export class TogetherProvider implements ProviderAdapter {
  name = "Together (serverless)";
  slug = "together";
  private client: OpenAI | null = null;

  /** Public OpenDoor model id → Together model id */
  static readonly MODEL_MAP: Record<string, string> = {
    "llama-3.1-8b-instruct": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    "llama-3.1-70b-instruct": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    "qwen2.5-7b-instruct": "Qwen/Qwen2.5-7B-Instruct-Turbo",
    "qwen2.5-72b-instruct": "Qwen/Qwen2.5-72B-Instruct-Turbo",
    "deepseek-v3": "deepseek-ai/DeepSeek-V3",
    "mistral-7b-instruct": "mistralai/Mistral-7B-Instruct-v0.3",
    "BAAI/bge-base-en-v1.5": "BAAI/bge-base-en-v1.5",
    "BAAI/bge-reranker-v2-m3": "BAAI/bge-reranker-v2-m3",
  };

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.TOGETHER_API_KEY;
    if (key) {
      this.client = new OpenAI({
        apiKey: key,
        baseURL: process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1",
      });
    }
  }

  private requireClient(): OpenAI {
    if (!this.client) {
      throw new Error(
        "Serverless wholesale path is not configured. Set TOGETHER_API_KEY on the gateway, or add an org BYOK key for provider 'together'."
      );
    }
    return this.client;
  }

  private upstreamModel(modelId: string): string {
    if (modelId === "deepseek-chat" || modelId === "deepseek-coder") {
      return TogetherProvider.MODEL_MAP["deepseek-v3"];
    }
    return TogetherProvider.MODEL_MAP[modelId] || modelId;
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
    const stream = await client.chat.completions.create({
      ...openaiChatPayload(request, true, model),
    } as any);

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

  async createEmbedding(opts: {
    model: string;
    input: string | string[];
    encoding_format?: string;
    dimensions?: number;
  }) {
    const client = this.requireClient();
    const model = this.upstreamModel(opts.model);
    const response = await client.embeddings.create({
      model,
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

  async createRerank(request: RerankRequest): Promise<RerankResult> {
    this.requireClient();
    const model = this.upstreamModel(request.model);
    const base = process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1";
    const response = await fetch(`${base.replace(/\/$/, "")}/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        query: request.query,
        documents: request.documents.map(documentText),
        top_n: request.top_n,
      }),
    });
    if (!response.ok) {
      throw new Error(`Together rerank error: ${await response.text()}`);
    }
    const data = (await response.json()) as {
      results?: Array<{ index: number; relevance_score: number }>;
    };
    return { results: data.results || [] };
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.client && isProductionRuntime()) {
      return [];
    }
    return Object.keys(TogetherProvider.MODEL_MAP).map((id) => ({
      id,
      object: "model" as const,
      created: Math.floor(Date.now() / 1000),
      owned_by: "together",
      provider: this.slug,
      display_name: id,
      supports_rerank: id.includes("rerank"),
    }));
  }
}
