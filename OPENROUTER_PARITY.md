# OpenRouter parity build tracker

Living checklist for matching the [OpenRouter](https://openrouter.ai/docs) developer surface. Update status when a slice lands. Do not mark a row done unless a caller can hit it through the gateway.

**Bar:** one OpenAI-shaped `/v1` key, explicit `provider` routing, org BYOK, generation lookup, and a models list that includes pricing — without dropping OpenDoor governance, residency, or spend caps.

## Wave A — honesty — **done**

| Item | Status | Notes |
|------|--------|--------|
| Serverless not advertised in prod without Vertex or Together | **done** | 503 `wholesale_not_configured` only if neither Vertex ADC/project nor Together/BYOK; Together-only leftover ids stay dark without a Together key |
| Training fail-closed in prod | **done** | No simulated `ft:` unless `ALLOW_SIMULATED_TRAINING=1` (dev only) |
| Live-models docs | **done** | Vertex Model Garden primary; Together optional overflow |

## Wave B — routing — **done**

| Item | Status | Notes |
|------|--------|--------|
| `provider` object on chat | **done** | `order`, `allow_fallbacks`, `sort`, `only`, `ignore` |
| BYOK | **done** | `organization_provider_keys` + `/api/byok` + gateway decrypt |
| `GET /v1/generation/:id` | **done** | Also `/v1/generations/:id` and `?id=` |
| Richer `/v1/models` | **done** | Pricing, context, architecture, supported params |

## Wave C — modalities — **done** (proxied)

| Item | Status | Notes |
|------|--------|--------|
| `POST /v1/images/generations` | **done** | OpenAI or Azure; 503 if neither |
| `POST /v1/audio/transcriptions` + `/speech` | **done** | OpenAI proxy |
| Batches cap + concurrency | **done** | 1000 rows, concurrency 8, 50% billing |
| Groq + xAI adapters | **done** | Fallback chains for common ids |

## Integration pass (2026-08-17)

Mounted `/v1/plugins`, `/v1/responses`, `/v1/files`. Registered Cerebras + Perplexity via `registerExtraProviders` (Groq/xAI already in `providers/index.ts`). Generation, images, and audio were already mounted.

## Leftover / later

| Item | Status | Notes |
|------|--------|--------|
| OpenRouter `transforms` / middle-out | done | Opt-in `transforms: ["middle-out"]` on chat; helper in `apps/gateway/src/lib/transforms.ts` |
| Full files + S3 batch pipeline | leftover | In-process batches only; `/v1/files` is local disk |
| Provider object on embeddings/completions | done | Same `order` / `allow_fallbacks` / `sort` / `only` / `ignore` chain |
| Apply BYOK migration on hosted Postgres | leftover | Cloud SQL, not the connected Supabase orgs |
| Extras BYOK | done | Cerebras/Perplexity optional `apiKey` + `instantiateProvider` |

## Explicitly later / never this year

FireConnect, custom kernels, B200/GB300 catalog, BYOC, serverless training API, FireOptimizer.
