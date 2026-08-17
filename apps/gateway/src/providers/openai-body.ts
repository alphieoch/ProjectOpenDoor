import type { ChatCompletionRequest } from "@opendoor/shared";

/** OpenAI-compatible chat body, including vision parts and structured output. */
export function openaiChatPayload(
  request: ChatCompletionRequest,
  stream: boolean,
  model = request.model
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
    stream,
  };
  if (request.temperature != null) body.temperature = request.temperature;
  if (request.max_tokens != null) body.max_tokens = request.max_tokens;
  if (request.top_p != null) body.top_p = request.top_p;
  if (request.frequency_penalty != null) {
    body.frequency_penalty = request.frequency_penalty;
  }
  if (request.presence_penalty != null) {
    body.presence_penalty = request.presence_penalty;
  }
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools;
    if (request.tool_choice) body.tool_choice = request.tool_choice;
  }
  if (request.response_format) body.response_format = request.response_format;
  if (request.user) body.user = request.user;
  if (request.prompt_cache_key) body.prompt_cache_key = request.prompt_cache_key;
  // Map OpenDoor service_tier → OpenAI service_tier where applicable
  if (request.service_tier === "priority") body.service_tier = "priority";
  else if (request.service_tier === "standard") body.service_tier = "default";
  if (request.enable_thinking != null) body.enable_thinking = request.enable_thinking;
  if (request.thinking_budget != null) body.thinking_budget = request.thinking_budget;
  return body;
}
