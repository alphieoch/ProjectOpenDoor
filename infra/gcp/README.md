# OpenDoor on Google Cloud (Firebase Hosting + Cloud Run)

All production traffic is Google-managed:

| Piece | Resource |
|-------|----------|
| Edge | Firebase Hosting site `opendoor-f39a4` (rewrites to Cloud Run) |
| App | Cloud Run `opendoor-dashboard` |
| API | Cloud Run `opendoor-gateway` |
| Code jail | Cloud Run `opendoor-sandbox` (gVisor, no egress) |
| Private image GPU | Retired `opendoor-comfy` (do not wire apps to it). Studio uses the gateway image path. |
| DB | Cloud SQL Postgres 16 `opendoor-pg` |
| Cache | Memorystore Redis `opendoor-redis` |
| Images | Artifact Registry `us-central1-docker.pkg.dev/.../opendoor` |
| Secrets | Secret Manager |

**Project:** `project-800192c2-3ecc-4889-8f7`  
**Region:** `us-central1`

## Live Cloud Run URLs (usable before Firebase Hosting)

```bash
gcloud run services describe opendoor-dashboard --region=us-central1 --format='value(status.url)'
gcloud run services describe opendoor-gateway --region=us-central1 --format='value(status.url)'
gcloud run services describe opendoor-sandbox --region=us-central1 --format='value(status.url)'
# opendoor-comfy is retired — do not point PRIVATE_IMAGE_GEN_URL at it.
```

## Prerequisites

```bash
gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project project-800192c2-3ecc-4889-8f7
firebase login   # required once for Hosting deploy (browser ToS)
npm i -g firebase-tools
```

## One-time bootstrap

```bash
./scripts/bootstrap-gcp.sh
```

Creates Artifact Registry, Cloud SQL, Memorystore, VPC connector, and Secret Manager entries.

**Firebase:** `firebase projects:addfirebase` may return 403 until you open  
https://console.firebase.google.com/ → select this GCP project → accept Firebase terms once. Then:

```bash
firebase hosting:sites:create opendoor-f39a4 --project project-800192c2-3ecc-4889-8f7
firebase deploy --only hosting --project project-800192c2-3ecc-4889-8f7
```

(`opendoor` / `opendoor-app` site IDs are globally reserved — use `opendoor-f39a4`.)

## Persistable Cloud Run env

`--set-env-vars` replaces the entire env list. Shared keys live in `infra/gcp/cloud-run-env.sh` (sourced by `scripts/deploy-gcp.sh` and Cloud Build).

| Key | Value |
|-----|--------|
| `GCP_PROJECT_ID` / `GCP_PROJECT` / `GOOGLE_CLOUD_PROJECT` | `project-800192c2-3ecc-4889-8f7` |
| `VERTEX_LOCATION` | `global` |
| `OPENDOOR_FILES_BUCKET` | `opendoor-files-800192c2` (gateway) |
| `STRIPE_WEB_SEARCH_ADDON_PRICE_ID` | `price_1U5OPSBZaqY5cS2ZgTgkHNDX` (test; dashboard) |
| `PRIVATE_IMAGE_GEN_URL` | Optional OpenAI-compatible image server. Unset by default. Never `opendoor-comfy`. |
| `PRIVATE_IMAGE_GEN_KIND` | `openai` when URL is set. `comfy` is off by default and undocumented. |

Files bucket: `gs://opendoor-files-800192c2` in `us-central1`. Cloud Run runtime SA `930761303874-compute@developer.gserviceaccount.com` has `roles/storage.objectAdmin`. See `DEPLOY_PERSIST.md`.

Comfy is retired. The `opendoor-comfy` Cloud Run service and `gs://opendoor-comfy-models` may still exist (cost). Deploy does not set app env to them.

Do not create a Together secret — Vertex replaces it.

## Deploy

**CI/CD:** a push to `main` on [alphieoch/ProjectOpenDoor](https://github.com/alphieoch/ProjectOpenDoor) runs Cloud Build trigger `opendoor-main` (`cloudbuild.yaml` — dashboard + gateway). Same substitutions as `./scripts/deploy-gcp.sh` (`_TAG=$SHORT_SHA`, `_SITE_ID=opendoor-gcp`, `_REGION=us-central1`, `_REPO=opendoor`, `_SQL_INSTANCE=opendoor-pg`, `_VPC_CONNECTOR=opendoor-connector`). Trigger definition: `infra/gcp/cloudbuild.trigger.yaml`.

One-time GitHub link (if the trigger cannot see the repo): Cloud Console → Cloud Build → Triggers → Connect repository → GitHub (Cloud Build GitHub App) → authorize and select `alphieoch/ProjectOpenDoor`. Then:

```bash
gcloud builds triggers create github \
  --trigger-config=infra/gcp/cloudbuild.trigger.yaml \
  --project=project-800192c2-3ecc-4889-8f7
```

Local `./scripts/deploy-gcp.sh` is still available for a manual Cloud Build (does not replace the trigger):

```bash
./scripts/deploy-gcp.sh
# or separately:
gcloud builds submit --config=infra/gcp/cloudbuild.dashboard.yaml
gcloud builds submit --config=infra/gcp/cloudbuild.gateway.yaml
gcloud builds submit --config=infra/gcp/cloudbuild.sandbox.yaml
# or: ./infra/gcp/deploy-sandbox.sh
# Do not deploy Comfy for Studio. Optional image worker: set PRIVATE_IMAGE_GEN_URL.
# local Docker instead:
USE_CLOUD_BUILD=0 ./scripts/deploy-gcp.sh
```

## Migrate / seed against Cloud SQL

```bash
./scripts/cloud-sql-proxy.sh &
# Use DATABASE_URL_PROXY from infra/gcp/connection.env (port 5433)
export DATABASE_URL='postgresql://opendoor:PASSWORD@127.0.0.1:5433/opendoor'
bun run seed:serverless
```

## Success checks

- Dashboard `/pricing` shows serverless `$ / 1M` rows
- Gateway `/health` → `{"status":"ok"}`
- After Firebase: `https://opendoor-f39a4.web.app/pricing` and `/v1/...`
- Edge LB (no Firebase): `./scripts/setup-edge-lb.sh` then `http://<EDGE_IP>/pricing`
- Ops one-shot: `TOGETHER_API_KEY=... ./scripts/finish-ops.sh`
- Training: `/dashboard/training` after migration `0028`
