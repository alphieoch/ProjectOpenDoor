---
sidebar_position: 4
---

# Cohere

Cohere models are available via Azure AI Foundry.

## Live Models

| Model | Type | Status |
|-------|------|--------|
| `cohere-command-a` | Chat | ✅ Live |

## Available on Request

| Model | Type |
|-------|------|
| `Cohere-command-r-plus-08-2024` | Chat |
| `Cohere-command-r-08-2024` | Chat |
| `Cohere-embed-v3-multilingual` | Embeddings |
| `Cohere-rerank-v3.5` | Classification |

## Azure Deployment

```bash
az cognitiveservices account deployment create \
  --name your-account --resource-group your-rg \
  --deployment-name cohere-command-a \
  --model-name cohere-command-a \
  --model-version "1" \
  --model-format Cohere \
  --sku-capacity 1 --sku-name GlobalStandard
```
