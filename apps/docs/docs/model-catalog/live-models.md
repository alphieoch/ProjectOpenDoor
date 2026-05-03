---
sidebar_position: 2
---

# Live Models

These models are currently deployed and ready to use in Azure.

## OpenAI

| Model | Type | Context | Status |
|-------|------|---------|--------|
| `gpt-4o` | Chat + Vision | 128K | ✅ Live |
| `gpt-4o-mini` | Chat + Vision | 128K | ✅ Live |
| `gpt-4.1` | Chat + Vision | 128K | ✅ Live |
| `gpt-4.1-mini` | Chat + Vision | 128K | ✅ Live |
| `o3-mini` | Reasoning | 128K | ✅ Live |
| `o4-mini` | Reasoning | 128K | ✅ Live |
| `text-embedding-3-small` | Embeddings | 8K | ✅ Live |

## DeepSeek

| Model | Type | Context | Status |
|-------|------|---------|--------|
| `DeepSeek-R1` | Reasoning | 128K | ✅ Live |
| `DeepSeek-V3.2` | Chat | 128K | ✅ Live |
| `DeepSeek-V4-Flash` | Chat | 128K | ✅ Live |

## Moonshot AI (Kimi)

| Model | Type | Context | Status |
|-------|------|---------|--------|
| `Kimi-K2.6-1` | Chat | 128K | ✅ Live |
| `Kimi-K2.5` | Chat | 128K | ✅ Live (rate limited) |

## Mistral AI

| Model | Type | Context | Status |
|-------|------|---------|--------|
| `Mistral-Large-3` | Chat | 128K | ✅ Live |

## Microsoft

| Model | Type | Context | Status |
|-------|------|---------|--------|
| `Phi-4` | Chat | 128K | ✅ Live |

## Cohere

| Model | Type | Context | Status |
|-------|------|---------|--------|
| `cohere-command-a` | Chat | 128K | ✅ Live |

## Quick Test

```bash
# Test any live model
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```
