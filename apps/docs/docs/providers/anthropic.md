---
sidebar_position: 3
---

# Anthropic

Anthropic Claude models are available via Azure AI Foundry (primary) and direct API (fallback).

## Configuration

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## Available Models

| Model | Context | Status |
|-------|---------|--------|
| `claude-opus-4-5` | 200K | 📋 Available on request |
| `claude-sonnet-4-5` | 200K | 📋 Available on request |
| `claude-haiku-4-5` | 200K | 📋 Available on request |

## Azure Deployment

Claude models can be deployed through Azure AI Foundry with the `Anthropic` format:

```bash
az cognitiveservices account deployment create \
  --name your-account --resource-group your-rg \
  --deployment-name claude-sonnet-4-5 \
  --model-name claude-sonnet-4-5 \
  --model-version "20250929" \
  --model-format Anthropic \
  --sku-capacity 1 --sku-name GlobalStandard
```
