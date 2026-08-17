# Developer surface tracker

Client-side SDK, CLI, and dashboard work for OpenRouter/Fireworks-level APIs. Gateway routing, schema, and adapters are owned by the other workstream.

`OPENROUTER_PARITY.md` did not exist when this landed, so tracker notes live here instead of racing that file.

## Dashboard / SDK

| Surface | Status | Notes |
|---------|--------|--------|
| `@opendoor/sdk` | **done** | `packages/sdk` — `OPENDOOR_API_KEY` + `OPENDOOR_BASE_URL` (default `http://localhost:3001`) |
| CLI extras | **done** | `generation get`, `images generate`, `audio transcribe`, chat `--provider-*` |
| Playground `provider` | **done** | Params rail → `POST /api/playground/chat` → gateway body |
| BYOK UI | **done** | `/dashboard/settings/byok` — talks to `/api/byok` (`apiKey` + `keyPrefix`) |
| BYOK API | **landed** (other workstream) | `organization_provider_keys` + dashboard `/api/byok` |

## Paths the client already calls

When the gateway workstream lands these, the SDK and CLI start working without further client changes:

| Method | Path | Used by |
|--------|------|---------|
| `POST` | `/v1/chat/completions` | SDK, CLI, playground (optional `provider`: `{ order, allow_fallbacks, sort, only, ignore }`) |
| `GET` | `/v1/models` | SDK, CLI |
| `GET` | `/v1/generation/:id` | SDK `generations.get`, CLI `generation get` (OpenRouter-style; also `?id=`) |
| `POST` | `/v1/images/generations` | SDK `images.generate`, CLI `images generate` |
| `POST` | `/v1/audio/transcriptions` | SDK `audio.transcribe` (FormData), CLI `audio transcribe` |
| `POST` / `GET` | `/v1/batches`, `/v1/batches/:id` | SDK, CLI (already existed) |

Images/audio/generation route files exist on the gateway; they still need to be mounted on `apps/gateway/src/index.ts` (other workstream).

## BYOK contract the UI uses

```
GET    /api/byok        → { keys: [{ id, providerSlug, label, keyPrefix, alwaysUse, createdAt, lastUsedAt }] }
POST   /api/byok        → { providerSlug, apiKey, label?, alwaysUse? }  (UI also sends secret)
DELETE /api/byok/:id
```

Never return the raw secret. Needs `API_SECRET_KEY` and migration `0035_organization_provider_keys.sql`.
