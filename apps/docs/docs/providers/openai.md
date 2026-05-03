---
sidebar_position: 2
---

# OpenAI

OpenAI Direct is configured as a **fallback provider** when Azure AI Foundry is unavailable.

## Configuration

```bash
OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=org-...  # optional
```

## Supported Models

When configured, OpenAI Direct provides fallback access to:
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`

## Fallback Behavior

OpenAI Direct is second in the fallback chain after Azure AI Foundry for GPT models.

## Rate Limits

OpenAI rate limits apply. Configure `maxRetries` and `timeout` in the provider settings if needed.
