# OpenDoor

Open-weight LLM API gateway for Africa and the Global South: one OpenAI-compatible `/v1` endpoint, a live model catalog, and a dashboard that reads real keys, usage, and billing.

OpenDoor sits between your app and the models you run — local Ollama, vendor APIs (DeepSeek, Qwen, Mistral, optional GPT/Claude/Gemini), or a GPU on this machine or GCP. **OpenBot** is the hosted coworker runtime (browser, `/workspace`, take-the-wheel). **OpenDoor Search** is visible on Tools and Pricing; queries are metered on org credits (or the Web Search add-on). No third-party search keys.

Docs while the dashboard is running: [http://localhost:3010/docs](http://localhost:3010/docs) · API: [http://localhost:3010/docs/api](http://localhost:3010/docs/api). Published: [https://opendoor-gcp.web.app/docs](https://opendoor-gcp.web.app/docs) · [https://opendoor-gcp.web.app/docs/api](https://opendoor-gcp.web.app/docs/api).

## Environments

### Production

| | URL |
|---|---|
| App | https://opendoor-gcp.web.app |
| OpenBot | https://opendoor-gcp.web.app/dashboard/openbot |
| Admin (site admins) | https://opendoor-gcp.web.app/dashboard/admin |
| Dashboard (Cloud Run) | https://opendoor-dashboard-u5ojp4qjiq-uc.a.run.app |
| Gateway | https://opendoor-gateway-u5ojp4qjiq-uc.a.run.app |
| Computer (shared Chromium) | https://opendoor-openbot-computer-u5ojp4qjiq-uc.a.run.app |
| GitHub | https://github.com/alphieoch/ProjectOpenDoor |
| This branch PR | https://github.com/alphieoch/ProjectOpenDoor/pull/2 |

Firebase Hosting (`opendoor-gcp`) is the public **HTTPS edge** (Google CDN-like). It rewrites `/v1/**` and `/health` to the gateway; everything else goes to the dashboard. WorkOS callbacks stay on `https://opendoor-gcp.web.app`.

A second Google HTTPS load balancer (`opendoor-edge`, IP `34.149.240.132`) sits beside Hosting — not in front of it — so custom-domain / OAuth redirects are not broken:

| Piece | Name |
|---|---|
| Cloud Armor (WAF + rate limit, allow the world) | `opendoor-armor` |
| Cloud CDN (static/app) | `opendoor-edge-dash-bs` |
| Armor-only API backend (no CDN) | `opendoor-edge-gw-bs` |
| HTTP → HTTPS | `http://34.149.240.132` → `https://opendoor-gcp.web.app` |
| Cloud DNS | **no zone** in this project (Firebase owns `*.web.app`) |

No Cloudflare. No geo-block (Africa included). Apply: `./scripts/setup-gcp-security.sh`. Zone-to-zone failover (Cloud SQL REGIONAL HA, Cloud Run min instances): `./scripts/setup-gcp-ha.sh`. Details: [infra/gcp/README.md](infra/gcp/README.md).

### Development (local)

| | URL |
|---|---|
| Dashboard | http://localhost:3010 |
| Gateway | http://localhost:3001 |
| OpenBot | http://localhost:3010/dashboard/openbot |
| Local computer | Docker supervisor `:4300` **or** `OPENBOT_COMPUTER_URL` (shared `:4100` or Cloud Run) |

Also useful locally: gateway health `http://localhost:3001/health`, site status `http://localhost:3010/status`, docs `http://localhost:3010/docs`.

## Run locally

Prerequisites: [Bun](https://bun.sh) >= 1.0, Docker (Postgres + Redis; OpenBot supervisor if you want isolated browsers).

```bash
git clone https://github.com/alphieoch/ProjectOpenDoor.git
cd ProjectOpenDoor
bun install
cp .env.example .env   # fill DATABASE_URL, REDIS_URL, AUTH_SECRET — never commit .env

docker compose up -d postgres redis
bun run db:migrate
bun --env-file=.env run scripts/seed.ts
bun run ingest:open-models

# Terminal 1 — API
bun run gateway:dev          # :3001
# Terminal 2 — console
bun run dashboard:dev        # :3010
```

Same apps: `bun --filter @opendoor/gateway dev` and `bun --filter @opendoor/dashboard dev`.

Create an API key in the dashboard, copy a **live** model id from Models, then:

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer YOUR_OPENDOOR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_MODEL_ID","messages":[{"role":"user","content":"Hello"}]}'
```

More detail: [Run locally](docs/getting-started/local-development.mdx), [Install](docs/getting-started/installation.mdx). GCP deploy: [infra/gcp/README.md](infra/gcp/README.md).

## Language and region

No URL prefix (paths stay Cloud Run / Firebase friendly). Locale is a cookie (`od_locale`) plus `users.locale` / `organizations.region` + `organizations.country` (also mirrored in org `metadata.world`).

**Switch language**

- Locale picker on login/signup, Get started, Pricing (header), onboarding, and the dashboard sidebar
- `?lang=sw` (or `?lang=ar`) on any page — Arabic is RTL
- Browser `Accept-Language` on first visit
- Settings → Profile → Language & region

First-class African locales: `en`, `fr`, `ar`, `pt`, `sw`, `ha`, `yo`, `am`, `zu`, plus `es`, `zh`, `hi`. Unknown tags fall back to English. Region (Africa / Europe / Americas / Asia-Pacific / Middle East) is never a geo-block.

**Translated screens (must-have copy only — not the whole dashboard)**

- Login / signup
- Regional onboarding + how the product works (Chat, house, shared pool)
- Get started
- Pricing audiences (Student / Family / Team / Enterprise)
- Tools Search one-liner
- OpenBot “What is this house?”

Catalogs: `apps/dashboard/messages/{locale}.json`. Resolve/RTL/Africa persist tests: `packages/shared/src/i18n.test.ts`. Apply `packages/database/migrations/0050_locale_region.sql` when you migrate.

## OpenBot computer URLs

Two mutually exclusive pointers. **No tokens in this README** — copy names from `.env.example` into your local `.env`.

| Variable | When to use |
|---|---|
| `OPENBOT_COMPUTER_URL` | Wins when set. Shared Chromium: Cloud Run production computer, or local `docker compose --profile shared-computer up -d openbot-computer` on `:4100`. |
| `OPENBOT_SUPERVISOR_URL` | Used only when `OPENBOT_COMPUTER_URL` is **unset**. Local Docker supervisor on `:4300` (`docker compose up -d openbot-supervisor`) — one container per OpenBot. |

Local dashboard/gateway can point `OPENBOT_COMPUTER_URL` at the Cloud Run computer URL above. Do not put that URL in client JS.

See [apps/openbot-computer/README.md](apps/openbot-computer/README.md) and [apps/openbot-supervisor/README.md](apps/openbot-supervisor/README.md).
