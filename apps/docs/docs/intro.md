---
sidebar_position: 1
slug: /
---

# OpenDoor Documentation

**OpenDoor** is a multi-region LLM API Gateway built on Azure, designed to route requests across multiple AI providers with intelligent fallback chains, usage tracking, and cost management.

## What is OpenDoor?

OpenDoor sits between your applications and various LLM providers (OpenAI, Azure AI Foundry, Anthropic, Mistral, Cohere, DeepSeek, and more), providing:

- **Unified API** — One endpoint for all models, OpenAI-compatible
- **Intelligent Routing** — Automatic fallback across providers when one fails
- **Model Catalog** — 160+ models from top providers, with "live" and "available on request" status
- **Usage Tracking** — Per-request logging, token counting, and cost calculation
- **Rate Limiting** — API-key based rate limits with Redis-backed counters
- **Admin Dashboard** — Manage API keys, view usage, configure pricing

## Quick Start

```bash
# Clone the repository
git clone https://github.com/OchiengandCo/opendoor.git
cd opendoor

# Install dependencies
pnpm install

# Start PostgreSQL and Redis (Docker)
docker-compose up -d postgres redis

# Run database migrations
pnpm db:migrate

# Start the gateway
pnpm gateway:dev

# Start the dashboard
pnpm dashboard:dev
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Your App   │────▶│  OpenDoor    │────▶│  Azure OpenAI   │
│  (Any SDK)  │     │  Gateway     │     │  (GPT-4o, etc.) │
└─────────────┘     │  (Bun/Hono)  │     └─────────────────┘
                    │              │     ┌─────────────────┐
                    │              │────▶│  Azure AI       │
                    │              │     │  Foundry        │
                    │              │     │  (DeepSeek, etc)│
                    │              │     └─────────────────┘
                    │              │     ┌─────────────────┐
                    │              │────▶│  Other Providers│
                    │              │     │  (Fallback)     │
                    └──────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │  PostgreSQL │
                    │  + Redis    │
                    └─────────────┘
```

## Features

| Feature | Status |
|---------|--------|
| Chat Completions | ✅ Live |
| Streaming (SSE) | ✅ Live |
| Embeddings | ✅ Live |
| Model Listing | ✅ Live |
| Usage Tracking | ✅ Live |
| Rate Limiting | ✅ Live |
| Multi-provider Fallback | ✅ Live |
| Admin Dashboard | ✅ Live |
| Image Generation | 📋 Available on request |
| Audio (TTS/STT) | 📋 Available on request |
| Video Generation | 📋 Available on request |

## Providers

OpenDoor supports the following providers:

- **Azure AI Foundry** — Primary provider with 15+ deployed models
- **OpenAI** — Direct API integration
- **Anthropic** — Claude models
- **Cohere** — Command and Embed models
- **Mistral AI** — Mistral Large and Small models
- **DeepSeek** — DeepSeek-R1, V3.2, V4-Flash
- **Moonshot AI** — Kimi K2.5, K2.6

## Next Steps

- [Install OpenDoor](/docs/getting-started/installation)
- [Explore the API](/docs/api-reference/chat-completions)
- [Browse the Model Catalog](/docs/model-catalog/overview)
