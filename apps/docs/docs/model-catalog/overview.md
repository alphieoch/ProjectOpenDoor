---
sidebar_position: 1
---

# Model Catalog Overview

OpenDoor provides access to **160+ models** from the world's leading AI providers through Azure AI Foundry.

## How It Works

Models are categorized into three statuses:

| Status | Icon | Meaning |
|--------|------|---------|
| **Live** | 🟢 | Deployed and ready to use |
| **Available on Request** | 📋 | In catalog but not deployed — contact admin |
| **Coming Soon** | 🚀 | Will be available shortly |

## Browse Models

```bash
curl http://localhost:3001/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY" | \
  jq '.data | map({id, status: .deployment_status, provider})'
```

## Model Categories

### Chat Completion
Text-based conversational AI models.

### Reasoning
Models with advanced reasoning capabilities (o3-mini, o4-mini, DeepSeek-R1).

### Vision
Multimodal models that can process images (gpt-4o, gpt-4.1).

### Embeddings
Text embedding models for vector search (text-embedding-3-small).

### Image Generation
Text-to-image models (DALL-E, Stable Diffusion).

### Audio
Speech-to-text and text-to-speech models (Whisper, TTS).

### Video
Video generation models (Sora).

## Next Steps

- [View Live Models](/docs/model-catalog/live-models)
- [Available on Request](/docs/model-catalog/available-on-request)
