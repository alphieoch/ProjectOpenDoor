---
sidebar_position: 1
---

# Chat Completions

OpenDoor provides an OpenAI-compatible chat completions endpoint with automatic provider fallback.

## Endpoint

```
POST /v1/chat/completions
```

## Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer YOUR_API_KEY` |
| `Content-Type` | Yes | `application/json` |

## Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Model ID (e.g., `gpt-4o`, `DeepSeek-R1`) |
| `messages` | array | Yes | Array of message objects |
| `stream` | boolean | No | Enable streaming (default: false) |
| `max_tokens` | integer | No | Maximum tokens to generate |
| `temperature` | number | No | Sampling temperature (0-2) |
| `top_p` | number | No | Nucleus sampling |
| `frequency_penalty` | number | No | Frequency penalty (-2 to 2) |
| `presence_penalty` | number | No | Presence penalty (-2 to 2) |
| `tools` | array | No | Available tools/functions |
| `tool_choice` | string/object | No | Tool selection strategy |

## Example Request

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is the capital of France?"}
    ],
    "max_tokens": 100
  }'
```

## Example Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1777777777,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The capital of France is Paris."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 7,
    "total_tokens": 32
  }
}
```

## Streaming

Set `stream: true` to receive Server-Sent Events (SSE):

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

Response format:

```
data: {"id":"...","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"...","choices":[{"delta":{"content":"!"}}]}

data: [DONE]
```

## Fallback Behavior

If the primary provider fails, OpenDoor automatically retries with fallback providers:

1. Azure AI Foundry (primary)
2. OpenAI Direct (fallback)
3. Other configured providers

Retries use exponential backoff (100ms, 200ms).

## Error Responses

### Model Not Found (404)

```json
{
  "error": "Model not found: unknown-model"
}
```

### Available on Request (400)

```json
{
  "error": "Model 'gpt-5.4' is available upon request",
  "message": "This model is not currently deployed. Contact your administrator...",
  "status": "available_on_request"
}
```

### Coming Soon (400)

```json
{
  "error": "Model 'DeepSeek-V4-Pro' is coming soon",
  "message": "DeepSeek V4 Pro will be available shortly...",
  "status": "coming_soon"
}
```

### All Providers Failed (502)

```json
{
  "error": "All providers failed",
  "detail": "Azure error [429]: Rate limit exceeded",
  "tried": ["azure-foundry", "openai"]
}
```
