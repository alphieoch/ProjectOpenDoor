export type ChatContentPart =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string; detail?: "auto" | "low" | "high" };
    };

export type ChatMessageContent = string | ChatContentPart[];

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: ChatMessageContent;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** DashScope / Qwen reasoning stream (thinking modes). */
  reasoning_content?: string;
}

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        description?: string;
        schema: Record<string, unknown>;
        strict?: boolean;
      };
    };

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type ProviderSort = "price" | "latency" | "throughput";

/** OpenRouter-compatible provider routing preferences. */
export interface ProviderPreferences {
  order?: string[];
  allow_fallbacks?: boolean;
  sort?: ProviderSort;
  only?: string[];
  ignore?: string[];
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
  response_format?: ResponseFormat;
  user?: string;
  /**
   * Fireworks-style capacity tier.
   * `priority` gets higher RPM/TPM and is never load-shed.
   * `standard` may 503 when GATEWAY_SHED_STANDARD=1 under load.
   */
  service_tier?: "standard" | "priority";
  /** Sticky prompt-cache key forwarded to OpenAI-compatible upstreams when supported */
  prompt_cache_key?: string;
  /** OpenRouter-style provider routing (order / only / ignore / sort). */
  provider?: ProviderPreferences;
  /** OpenRouter-compatible prompt transforms. `middle-out` keeps system + first/last slices. */
  transforms?: Array<"middle-out" | string>;
  /** Qwen / DashScope: enable chain-of-thought before the final answer. */
  enable_thinking?: boolean;
  /** Qwen / DashScope: max reasoning tokens when thinking is enabled. */
  thinking_budget?: number;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: UsageInfo;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** Prompt tokens served from cache when the provider reports them */
  cached_tokens?: number;
}

export interface CompletionRequest {
  model: string;
  prompt: string | string[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  user?: string;
}

export interface CompletionResponse {
  id: string;
  object: "text_completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    text: string;
    finish_reason: "stop" | "length" | null;
  }>;
  usage: UsageInfo;
}

export interface RerankRequest {
  model: string;
  query: string;
  documents: Array<string | { text: string }>;
  top_n?: number;
}

export interface RerankResult {
  results: Array<{ index: number; relevance_score: number }>;
}

export interface BatchRequestLine {
  custom_id: string;
  method?: "POST";
  url?: string;
  body: ChatCompletionRequest;
}

export interface BatchJob {
  id: string;
  object: "batch";
  endpoint: string;
  status:
    | "validating"
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "expired"
    | "cancelled";
  model?: string | null;
  input_file_id?: string | null;
  output_file_id?: string | null;
  completion_window?: string;
  request_counts: {
    total: number;
    completed: number;
    failed: number;
  };
  output?: Array<{
    custom_id: string;
    response?: unknown;
    error?: { message: string };
  }> | null;
  error?: string | null;
  created_at: number;
  expires_at?: number | null;
  completed_at?: number | null;
}

export interface ModelPricing {
  /** USD per 1M prompt tokens */
  prompt?: number | null;
  /** USD per 1M completion tokens */
  completion?: number | null;
  /** OpenRouter-style per-token strings (USD) */
  prompt_per_token?: string | null;
  completion_per_token?: string | null;
}

export interface ModelArchitecture {
  modality?: string;
  input_modalities?: string[];
  output_modalities?: string[];
}

export interface ModelInfo {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  provider: string;
  display_name?: string;
  context_window?: number;
  supports_vision?: boolean;
  supports_tools?: boolean;
  supports_json_mode?: boolean;
  supports_rerank?: boolean;
  pricing?: ModelPricing;
  architecture?: ModelArchitecture;
  supported_parameters?: string[];
  top_provider?: { slug: string };
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  organizationId: string;
  createdAt: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
}

export interface ProviderConfig {
  id: string;
  name: string;
  slug: string;
  baseUrl?: string;
  apiKeyEnvVar: string;
  enabled: boolean;
  region?: string;
}

export interface PricingRule {
  id: string;
  providerId: string;
  modelId: string;
  region: string;
  inputCostPer1K: number;
  outputCostPer1K: number;
  markupPercent: number;
  finalInputCostPer1K: number;
  finalOutputCostPer1K: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
}

export interface RequestLog {
  id: string;
  apiKeyId: string;
  organizationId: string;
  providerId: string;
  modelId: string;
  requestType: "chat" | "embedding" | "image" | "rerank" | "completion";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  costUsd: number;
  status: "success" | "error" | "cached";
  errorMessage?: string;
  createdAt: Date;
  region: string;
}

export interface StreamingCallbacks {
  onChunk?: (chunk: ChatCompletionChunk) => void;
  onFinish?: (usage: UsageInfo) => void;
  onError?: (error: Error) => void;
}
