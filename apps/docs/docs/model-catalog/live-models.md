# Live Models

A model is **live** when a caller can complete `POST /v1/chat/completions` against it. That is not Azure-only.

| Path | When it is live |
|------|-----------------|
| Vertex Model Garden | Production if GCP project + ADC (or `VERTEX_API_KEY`) — Gemma 4, Qwen3 Next/Coder, DeepSeek V3.2/R1, Kimi, MiniMax, GLM, gpt-oss, Gemini 2.5 |
| Together overflow | Production only if `TOGETHER_API_KEY` is set (or org BYOK for `together`) |
| Local Ollama | Ollama is running |
| Vendor APIs | Matching key is set (DeepSeek, Qwen, Mistral, Groq, xAI) |
| Closed / Azure | Azure Foundry or OpenAI/Anthropic/Google/Cohere configured |

Llama 3.1 / 3.3 / 4 MaaS still 404 on this project. Canonical copy: `docs/model-catalog/live-models.mdx`.

Image/video (ADC probe): `gemini-2.5-flash-image`, `gemini-3.1-flash-image`, `gemini-3-pro-image`, `veo-3.1-fast-generate-001`, `veo-3.1-generate-001` returned 200. Imagen 3/4 and Veo 2/3.0 returned 404.
