---
sidebar_position: 3
---

# Embeddings

## Create Embeddings

```
POST /v1/embeddings
```

## Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Embedding model ID |
| `input` | string/array | Yes | Text to embed |
| `encoding_format` | string | No | `float` or `base64` |
| `dimensions` | integer | No | Number of dimensions |

## Example

```bash
curl http://localhost:3001/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "The quick brown fox"
  }'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.0023, -0.0091, ...],
      "index": 0
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 4,
    "total_tokens": 4
  }
}
```

## Available Embedding Models

| Model | Provider | Dimensions | Status |
|-------|----------|------------|--------|
| `text-embedding-3-small` | OpenAI | 1536 | ✅ Live |
| `text-embedding-3-large` | OpenAI | 3072 | 📋 Available on request |
| `Cohere-embed-v3-multilingual` | Cohere | 1024 | 📋 Available on request |
