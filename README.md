# OpenDoor

Open-weight LLM API gateway for Africa and the Global South: one OpenAI-compatible `/v1` endpoint, a live model catalog, and a dashboard that reads real keys, usage, and billing.

OpenDoor sits between your app and the models you run — local Ollama, vendor APIs (DeepSeek, Qwen, Mistral, optional GPT/Claude/Gemini), or a GPU on this machine or GCP. **OpenBot** is the hosted coworker runtime (browser, `/workspace`, take-the-wheel).

Docs while the dashboard is running: [http://localhost:3010/docs](http://localhost:3010/docs). Published site: [https://opendoor-gcp.web.app/docs](https://opendoor-gcp.web.app/docs).

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

Firebase Hosting (`opendoor-gcp`) rewrites `/v1/**` and `/health` to the gateway; everything else goes to the dashboard.

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

## OpenBot computer URLs

Two mutually exclusive pointers. **No tokens in this README** — copy names from `.env.example` into your local `.env`.

| Variable | When to use |
|---|---|
| `OPENBOT_COMPUTER_URL` | Wins when set. Shared Chromium: Cloud Run production computer, or local `docker compose --profile shared-computer up -d openbot-computer` on `:4100`. |
| `OPENBOT_SUPERVISOR_URL` | Used only when `OPENBOT_COMPUTER_URL` is **unset**. Local Docker supervisor on `:4300` (`docker compose up -d openbot-supervisor`) — one container per OpenBot. |

Local dashboard/gateway can point `OPENBOT_COMPUTER_URL` at the Cloud Run computer URL above. Do not put that URL in client JS.

See [apps/openbot-computer/README.md](apps/openbot-computer/README.md) and [apps/openbot-supervisor/README.md](apps/openbot-supervisor/README.md).
