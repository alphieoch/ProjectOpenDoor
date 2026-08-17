# Leftover parity (this workstream)

Shipped without touching gateway `index.ts`, the TS SDK, CLI, playground, BYOK settings, or the other tracker files.

## Shipped

- **Python SDK** at `packages/python-sdk/` (`pip install -e packages/python-sdk`, import `opendoor`). Client: `OpenDoor(api_key=, base_url=)` with `chat.completions.create` (optional `provider=`), `models.list`, `generations.get`, `images.generate`, `audio.transcribe`, `batches.create/get/list`. Not published to PyPI.
- **Extra provider adapters** (new files only):
  - `apps/gateway/src/providers/cerebras.ts` — `https://api.cerebras.ai/v1` + `CEREBRAS_API_KEY`
  - `apps/gateway/src/providers/perplexity.ts` — `https://api.perplexity.ai` + `PERPLEXITY_API_KEY` (Vertex/Bedrock substitute)
  - `apps/gateway/src/providers/extras.ts` — `registerExtraProviders(register)`
- **Public rankings** at `/rankings` — price from `/api/public/pricing`, configured/up from `/api/status`. No invented latency. Linked from marketing nav (`MARKETING_PAGES` + header).
- **Env** — `CEREBRAS_API_KEY` and `PERPLEXITY_API_KEY` added to `.env.example`.
- **Wire-up note** — `PROVIDER_EXTRAS.md` has the two-line `index.ts` patch.

## Still needed in `providers/index.ts` (parity agent)

```ts
import { registerExtraProviders } from "./extras.js";
registerExtraProviders(register);
```

Call after the existing Cohere register block. Do not forget fallback/direct mappings if those models should resolve before `listModels()` scans.

## Skipped

- **Bedrock / Vertex** — AWS SigV4 and GCP ADC are too heavy for a thin adapter. Perplexity is the OpenAI-compatible substitute. No half-broken `bedrock.ts` / `vertex.ts`.
- **Gateway routes** for `/v1/generations`, `/v1/images`, `/v1/audio` — owned by the parity agent; the Python client already calls those paths.
- **`providers/index.ts` wire-up** — owned by the parity agent.
- TypeScript SDK, CLI, playground, BYOK settings, `packages/database`, training runner, and the other parity trackers.
