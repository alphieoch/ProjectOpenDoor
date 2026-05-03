---
sidebar_position: 2
---

# Configuration

## Gateway Configuration

The gateway reads configuration from environment variables. Key settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Gateway port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `REDIS_URL` | Redis connection string | — |
| `AUTH_SECRET` | JWT signing secret | — |
| `GATEWAY_API_KEY_HASH_SECRET` | API key hashing secret | — |
| `AZURE_AI_FOUNDRY_ENDPOINT` | Azure OpenAI endpoint | — |
| `AZURE_AI_FOUNDRY_KEY` | Azure OpenAI API key | — |
| `AZURE_REGION` | Azure region | `uksouth` |

## Provider Configuration

### Azure AI Foundry (Primary)

```bash
AZURE_AI_FOUNDRY_ENDPOINT=https://your-account.openai.azure.com/
AZURE_AI_FOUNDRY_KEY=your-key
AZURE_INFERENCE_ENDPOINT=https://your-ai-services.cognitiveservices.azure.com/
AZURE_INFERENCE_KEY=your-inference-key
```

### Optional Fallback Providers

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Cohere
COHERE_API_KEY=...

# Mistral
MISTRAL_API_KEY=...

# DeepSeek
DEEPSEEK_API_KEY=...
```

## Dashboard Configuration

```bash
# Dashboard port
PORT=3000

# Gateway URL
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Full `.env` Example

See `.env.example` in the project root for a complete reference.
