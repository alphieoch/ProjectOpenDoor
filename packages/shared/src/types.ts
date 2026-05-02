export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
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
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  user?: string;
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
  requestType: "chat" | "embedding" | "image";
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
