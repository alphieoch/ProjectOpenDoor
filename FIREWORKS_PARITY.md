# Fireworks parity build tracker

Living checklist for matching the [Fireworks](https://fireworks.ai/pricing#serverless-pricing) developer surface. Update status when a slice lands. Do not mark a row done unless a caller can hit it through the gateway.

**Bar:** a new API key can call an open-weight model with no “Request GPU” step, a published `$ / 1M` rate, and the extras below.

## Wave 1 — API surface — **done**

Structured outputs, vision, rerank, completions, batches, docs, CLI.

## Wave A (OpenRouter/Fireworks honesty, 2026-08) — **done**

Production 503s serverless only when **none** of Vertex ADC/project, Together key, or Together BYOK exist. Vertex Model Garden is the wholesale path (Gemma 4 / Qwen3 Next / DeepSeek V3.2 / Gemini 2.5). Together is optional overflow for legacy ids. Training no longer mints simulated `ft:` ids in production; local simulator requires `ALLOW_SIMULATED_TRAINING=1`. See `OPENROUTER_PARITY.md` for routing, BYOK, generation, images, audio, Groq/xAI.

## Wave 2 — Commercial honesty — **done** (Vertex wholesale; Together optional)

Public pricing, cached/batch rates, GPU SKUs, serverless flag, embeddings, prompt-cache billing + affinity, GPU-second billing, `service_tier`, spend-tier TPM unlock.

## Wave 3 — Dedicated deployments — **done**

Local/GCP GPU, custom weights, precision, autoscaling/scale-to-zero, multi-LoRA, A/B routers, reserved capacity.

## Wave 4 — Training — **done**

| Item | Status | Notes |
|------|--------|--------|
| Dataset upload | **done** | `/api/training/datasets` + UI |
| SFT (LoRA / full-param) | **done** | Jobs + Together or local trainer |
| DPO / ORPO | **done** | `method` on training jobs |
| RFT / GRPO | **done** | Job methods accepted |
| Evaluators + eval jobs | **done** | `/api/training/evals` |
| Serve fine-tune at base-model price | **done** | `ft:` → `bill_as_base` pricing |

## Wave 6 — User weight import — **done**

Paste a Hugging Face repo or Ollama tag → preview size → list in catalog → download onto this Mac or a GCP GPU. Frontier checkpoints (Qwen3.8 2.4T) are listed and routed to DashScope `qwen3.8-max` when `QWEN_API_KEY` is set; they are not pulled onto an L4.

| Item | Status | Notes |
|------|--------|--------|
| Import UI | **done** | Models → Import weights |
| HF / Ollama resolve | **done** | `/api/models/import` |
| Local `ollama pull` / `hf.co/…` | **done** | Laptop-sized only |
| GCP vLLM download | **done** | Mid-size dedicated |
| Qwen3.8-Max API id | **done** | DashScope route when key present |

## Wave 5 — Logged-in product — **done**

Request inspector + consistent dashboard chrome now that AuthKit login works.

| Item | Status | Notes |
|------|--------|--------|
| Request logs | **done** | `/dashboard/logs` + `/api/requests` |
| Page chrome | **done** | Shared `PageHeader` on workspace + governance pages |
| Together Secret Manager | optional | Overflow only — Vertex ADC is the wholesale path |

## Ops

| Item | Status | Notes |
|------|--------|--------|
| Cloud Run dashboard + gateway | **done** | |
| Cloud SQL + Memorystore + VPC | **done** | |
| HTTPS edge Load Balancer | **done** | `scripts/setup-edge-lb.sh` → `opendoor-edge` |
| Together Secret Manager | **optional** | Overflow only. Do not create a Together secret unless you want those leftover ids. |
| Firebase Hosting `opendoor-gcp` | **done** | https://opendoor-gcp.web.app — `opendoor-f39a4` is a different GCP project |

## Explicitly later / never this year

FireConnect, FireRouter-as-SKU, BYOC, custom kernels, B200/GB300 catalog, serverless training API, Fast (100+ tok/s) paths.

## How to finish ops

```bash
# Vertex is primary — ADC + GOOGLE_CLOUD_PROJECT (already used for web search).
# Together is optional overflow:
# export TOGETHER_API_KEY=...
./scripts/finish-ops.sh
```

Training UI: `/dashboard/training`  
Request logs: `/dashboard/logs`  
Docs: `apps/docs/docs/api-reference/training.md`
