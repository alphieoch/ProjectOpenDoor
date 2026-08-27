# OpenDoor

Open-weight LLM API gateway for Africa and the Global South: one OpenAI-compatible `/v1` endpoint, a live model catalog, and a dashboard that reads real keys, usage, and billing.

OpenDoor sits between your app and the models you run — local Ollama, vendor APIs (DeepSeek, Qwen, Mistral, optional GPT/Claude/Gemini), or a GPU on this machine or GCP. **OpenBot** is the hosted coworker runtime (browser, `/workspace`, take-the-wheel). **OpenDoor Search** is visible on Tools and Pricing; queries are metered on org credits (or the Web Search add-on). No third-party search keys.

Docs while the dashboard is running: [http://localhost:3010/docs](http://localhost:3010/docs) · API: [http://localhost:3010/docs/api](http://localhost:3010/docs/api). Published: [https://opendoor-gcp.web.app/docs](https://opendoor-gcp.web.app/docs) · [https://opendoor-gcp.web.app/docs/api](https://opendoor-gcp.web.app/docs/api).

## Environments

### Production

| Component | URL / Endpoint | Notes |
|---|---|---|
| **Cloudflare Edge Proxy** | [https://opendoor-edge-proxy.cloudflare-edge.workers.dev](https://opendoor-edge-proxy.cloudflare-edge.workers.dev) | Global 300+ city CDN, Auto-SSL, WAF & DDoS |
| **App (Firebase Edge)** | [https://opendoor-gcp.web.app](https://opendoor-gcp.web.app) | Public HTTPS Edge |
| **OpenBot Workspace** | [https://opendoor-gcp.web.app/dashboard/openbot](https://opendoor-gcp.web.app/dashboard/openbot) | Autonomous agent runtime |
| **Admin Console** | [https://opendoor-gcp.web.app/dashboard/admin](https://opendoor-gcp.web.app/dashboard/admin) | Site administration |
| **Dashboard (Cloud Run)** | `https://opendoor-dashboard-u5ojp4qjiq-uc.a.run.app` | Serverless Next.js App |
| **Gateway (Cloud Run)** | `https://opendoor-gateway-u5ojp4qjiq-uc.a.run.app` | OpenAI-compatible API Gateway |
| **Supabase Postgres (GCP)** | `10.128.0.2:6543` (Internal Supavisor) | `e2-standard-4` + 200 GB `pd-ssd` (`opendoor-supabase-0704`) |
| **Supabase Studio UI** | `http://localhost:54323` (via IAP Tunnel) | Zero-trust admin dashboard |
| **Disaster Recovery (GCS)** | `gs://opendoor-supabase-0704-supabase-backups` | Continuous WAL streaming + daily snapshots |
| **VPC Access Connector** | `opendoor-connector` (`10.8.0.0/28`) | Private serverless sub-ms latency |
| **GitHub Repository** | [https://github.com/alphieoch/ProjectOpenDoor](https://github.com/alphieoch/ProjectOpenDoor) | Source Code & Workflows |
| **Active Pull Request** | [https://github.com/alphieoch/ProjectOpenDoor/pull/2](https://github.com/alphieoch/ProjectOpenDoor/pull/2) | PR #2 |

### Edge & Zero-Trust Network Architecture

```
User → Cloudflare Edge (*.workers.dev) → Cloud Run Origin → VPC Connector (10.8.0.0/28) → Private Supabase VM (10.128.0.2:6543)
```

- **Cloudflare Edge Layer**: Sits in front of Cloud Run and the API Gateway, handling global CDN edge caching (`/_next/static/*`, media, storage assets), Full (Strict) SSL/TLS 1.3 termination, and DDoS mitigation.
- **Compute Layer**: Google Cloud Run instances communicate privately through the Serverless VPC Access Connector (`opendoor-connector`).
- **Database Layer**: Production Supabase stack (`db`, `pooler`, `kong`, `auth`, `rest`, `storage`, `realtime`, `caddy`, `meta`, `studio`) running on GCE with a 200 GB SSD persistent disk. Public database ports (`5432`, `6543`) are strictly blocked from the internet; database traffic is only routed over internal private VPC IPs.
- **Disaster Recovery**: Automated point-in-time recovery (PITR) with continuous WAL archiving and daily `pg_dumpall` snapshots stored in Google Cloud Storage with 30-day lifecycle auto-expiry.

Detailed guides:
- 📖 [Cloudflare Edge Integration Guide](docs/deployment/cloudflare-edge-guide.md)
- 📖 [Supabase GCP Production Deployment Guide](docs/deployment/supabase-gcp-production-guide.md)

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
