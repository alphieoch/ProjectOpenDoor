# OpenDoor leftover production ops

Do not rotate keys. Do not force-push. Do not commit `.env`.

## Done this run (2026-08-17)

| Item | Result |
|---|---|
| `0037_workflow_runs.sql` local `postgresql://localhost:5432/opendoor` | Already present; re-applied `IF NOT EXISTS` (no-op) |
| `0037_workflow_runs.sql` Cloud SQL `opendoor-pg` via Auth Proxy `:5433` | **Applied** (`workflow_runs` + indexes) |
| `0038_batch_object_storage.sql` Cloud SQL `opendoor-pg` via Auth Proxy `:5433` | **Applied** (created missing `batch_jobs` via 0025 first; local skipped — Docker/Postgres down) |
| Cloud Run `opendoor-dashboard` env | **Set** `STRIPE_WEB_SEARCH_ADDON_PRICE_ID=price_1U5OPSBZaqY5cS2ZgTgkHNDX` (test price). Revision `opendoor-dashboard-00013-xxj` |
| Vertex IAM | **Granted** `roles/aiplatform.user` to Cloud Run runtime SA `930761303874-compute@developer.gserviceaccount.com` on `project-800192c2-3ecc-4889-8f7` |
| SokoHut / J&L Supabase | **Not touched** |

Project / region / SA matched the repo (`infra/gcp/README.md`). Dashboard URL: `https://opendoor-dashboard-u5ojp4qjiq-uc.a.run.app`

## Stripe — Web Search add-on

Created in **test mode** on account `acct_1TSmgXBsJ3MxjFiT` (Project opendoor):

| | |
|---|---|
| Product | `OpenDoor Web Search` |
| Product id | `prod_V5ZYHJZu0Gt26E` |
| Price | `$20/month` USD recurring |
| Price id | `price_1U5OPSBZaqY5cS2ZgTgkHNDX` |
| Metadata | `app=opendoor` |

`apps/dashboard/scripts/setup-stripe-products.ts` already matches this (name + `getOrCreateMonthlyPrice(..., 2000)`). Re-run:

```bash
bun --env-file=.env apps/dashboard/scripts/setup-stripe-products.ts
```

Local `.env` and `apps/dashboard/.env` have `STRIPE_WEB_SEARCH_ADDON_PRICE_ID=price_1U5OPSBZaqY5cS2ZgTgkHNDX`. `.env.example` already documented the key.

Cloud Run dashboard now has that **test** price id (same as Pro/Team/Agents/top-ups). Billing checkout should no longer 400 for “not configured” in test.

### Live mode — still blocked

This run: Stripe MCP session only had **OpenMart** (`acct_1TVKC5Dt4zc2Hm5e` live + test), not Project opendoor `acct_1TSmgXBsJ3MxjFiT`. Live write **works** on OpenMart (product create succeeded, then archived — do not use `prod_V5ZvdQaS6ZYN9V`). OpenDoor live catalog was not writable because that account is not connected.

Re-consent MCP and add Project opendoor, then retry, or create it in the Dashboard:

1. Re-consent MCP write / add the OpenDoor account: https://access.stripe.com/mcp/oauth2/authorize/sessions/oases_V5ZpOdp7UemsVJ
2. Also: [Stripe API keys](https://dashboard.stripe.com/acct_1TSmgXBsJ3MxjFiT/apikeys)
3. Dashboard → **Test mode OFF** → **Product catalog** → **Add product**
4. Name: `OpenDoor Web Search`
5. Description: `Web Search add-on — live Google results via Vertex AI Grounding. Platform GCP keys stay on the server.`
6. Recurring price: **$20.00 USD / month**
7. Metadata: `app` = `opendoor`
8. Copy the live `price_...` into Cloud Run (and local `.env` if you switch to `sk_live`)

```bash
gcloud run services update opendoor-dashboard \
  --project=project-800192c2-3ecc-4889-8f7 \
  --region=us-central1 \
  --update-env-vars=STRIPE_WEB_SEARCH_ADDON_PRICE_ID=price_LIVE_HERE
```

Still add the same key to `cloudbuild.yaml` / `scripts/deploy-gcp.sh` `--set-env-vars` so the next deploy does not drop it. Not done this run (app code left untouched).

## Database 0035 + 0036 + 0037

| Target | Status |
|---|---|
| Local `postgresql://localhost:5432/opendoor` | 0035/0036 already present; 0037 already present (re-applied `IF NOT EXISTS`) |
| Cloud SQL `opendoor-pg` via Auth Proxy `:5433` | 0035/0036 applied earlier; **0037 applied this run** |
| SokoHut / J&L Supabase | **Not touched** (do not apply) |

Replay against Cloud SQL (proxy already documented in `infra/gcp/README.md`):

```bash
# If the proxy is not running (repo script defaults to :5432; connection.env uses :5433)
CLOUD_SQL_PROXY_PORT=5433 ./scripts/cloud-sql-proxy.sh

# Do not print this URL. It lives in infra/gcp/connection.env as DATABASE_URL_PROXY.
set -a
source <(grep -E '^DATABASE_URL_PROXY=' infra/gcp/connection.env)
set +a
export DATABASE_URL="$DATABASE_URL_PROXY"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f packages/database/migrations/0035_organization_provider_keys.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f packages/database/migrations/0036_web_search_addon.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f packages/database/migrations/0037_workflow_runs.sql
```

Interactive alternative (password prompt, no file echo):

```bash
gcloud sql connect opendoor-pg \
  --project=project-800192c2-3ecc-4889-8f7 \
  --user=opendoor \
  --database=opendoor
# then paste the SQL files
```

## GCP — Vertex / Cloud Run SA

Project: `project-800192c2-3ecc-4889-8f7`  
Cloud Run runtime SA (gateway + dashboard): `930761303874-compute@developer.gserviceaccount.com`

`roles/aiplatform.user` is **now** on that SA (confirmed via `gcloud projects get-iam-policy`).

```bash
gcloud projects add-iam-policy-binding project-800192c2-3ecc-4889-8f7 \
  --member="serviceAccount:930761303874-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

## Together API key — optional overflow

Vertex AI Model Garden is the serverless wholesale path (`GOOGLE_CLOUD_PROJECT` / ADC). `TOGETHER_API_KEY` is **not** required. Secret `opendoor-together-api-key` does **not** exist. Do not invent a key. Do not create a Together secret unless you want leftover ids (`llama-3.1-*-instruct`, `qwen2.5-*`, `deepseek-v3`, `mistral-7b-instruct`, BGE).

When you have `TOGETHER_API_KEY` in the shell:

```bash
export TOGETHER_API_KEY=...   # do not commit
./scripts/finish-ops.sh
# or:
./scripts/upsert-gcp-secret.sh opendoor-together-api-key TOGETHER_API_KEY
gcloud run services update opendoor-gateway \
  --project=project-800192c2-3ecc-4889-8f7 \
  --region=us-central1 \
  --update-secrets=TOGETHER_API_KEY=opendoor-together-api-key:latest
```

## Firebase Hosting ToS — still blocked

`firebase hosting:sites:list --project=project-800192c2-3ecc-4889-8f7` returns **no sites**. Still blocked until Firebase is linked / ToS accepted:

1. Open https://console.firebase.google.com/ → Add project → select `project-800192c2-3ecc-4889-8f7` → accept ToS
2. `firebase login`
3. `firebase hosting:sites:create opendoor-f39a4 --project project-800192c2-3ecc-4889-8f7`
4. `firebase deploy --only hosting --project project-800192c2-3ecc-4889-8f7`

Until then, use Cloud Run URLs or `./scripts/setup-edge-lb.sh` (`scripts/finish-ops.sh` already tries the LB path).
