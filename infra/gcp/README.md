# OpenDoor on Google Cloud (Firebase Hosting + Cloud Run)

All production traffic is Google-managed:

| Piece | Resource |
|-------|----------|
| Edge | Firebase Hosting site `opendoor-gcp` (rewrites to Cloud Run) |
| App | Cloud Run `opendoor-dashboard` |
| API | Cloud Run `opendoor-gateway` |
| Code jail | Cloud Run `opendoor-sandbox` (gVisor, no egress) |
| OpenBot computer | Cloud Run `opendoor-openbot-computer` (shared Chromium). Per-Bot supervisor stays local (Docker socket). |
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
firebase hosting:sites:create opendoor-gcp --project project-800192c2-3ecc-4889-8f7
firebase deploy --only hosting --project project-800192c2-3ecc-4889-8f7
```

(`opendoor` / `opendoor-app` / `opendoor-f39a4` site IDs are reserved elsewhere — this repo uses `opendoor-gcp`.)

## Persistable Cloud Run env

`--set-env-vars` replaces the entire env list. Shared keys live in `infra/gcp/cloud-run-env.sh` (sourced by `scripts/deploy-gcp.sh` and Cloud Build).

| Key | Value |
|-----|--------|
| `GCP_PROJECT_ID` / `GCP_PROJECT` / `GOOGLE_CLOUD_PROJECT` | `project-800192c2-3ecc-4889-8f7` |
| `VERTEX_LOCATION` | `global` |
| `VERTEX_IMAGE_LOCATION` | `global` |
| `VERTEX_IMAGE_MODEL` | `gemini-3.1-flash-image` (Nano Banana) |
| `VERTEX_VEO_MODEL` | `veo-3.1-fast-generate-001` |
| `OPENDOOR_FILES_BUCKET` | `opendoor-files-800192c2` (gateway) |
| `STRIPE_WEB_SEARCH_ADDON_PRICE_ID` | `price_1U5OPSBZaqY5cS2ZgTgkHNDX` (test; dashboard) |
| `PRIVATE_IMAGE_GEN_URL` | Optional OpenAI-compatible image server. Unset by default. Never `opendoor-comfy`. |
| `PRIVATE_IMAGE_GEN_KIND` | `openai` when URL is set. `comfy` is off by default and undocumented. |
| `OPENBOT_COMPUTER_URL` | Cloud Run URL of `opendoor-openbot-computer` when that service exists. Shared Chromium; not the local Docker supervisor. |

Files bucket: `gs://opendoor-files-800192c2` in `us-central1`. Cloud Run runtime SA `930761303874-compute@developer.gserviceaccount.com` has `roles/storage.objectAdmin`. See `DEPLOY_PERSIST.md`.

Comfy is retired. The `opendoor-comfy` Cloud Run service and `gs://opendoor-comfy-models` may still exist (cost). Deploy does not set app env to them.

Do not create a Together secret — Vertex replaces it.

## Deploy

**CI/CD:** a push to `main` on [alphieoch/ProjectOpenDoor](https://github.com/alphieoch/ProjectOpenDoor) runs Cloud Build trigger `opendoor-main` (`cloudbuild.yaml` — dashboard + gateway). Same substitutions as `./scripts/deploy-gcp.sh` (`_TAG=$SHORT_SHA`, `_SITE_ID=opendoor-gcp`, `_REGION=us-central1`, `_REPO=opendoor`, `_SQL_INSTANCE=opendoor-pg`, `_VPC_CONNECTOR=opendoor-connector`). Trigger definition: `infra/gcp/cloudbuild.trigger.yaml`. Connection: `github` in `us-central1`.

One-time GitHub authorization (Cloud Build GitHub App — required before the trigger can fire):

1. Open this link while signed into the Google account that owns the GCP project (`alphonce@ochiengandco.com`):  
   [Authorize Cloud Build GitHub OAuth](https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fconsole.cloud.google.com%2Fm%2Fgcb%2Fgithub%2Flocations%2Fus-central1%2Foauth_v2%3Fconnection_name%3Dprojects%252F930761303874%252Flocations%252Fus-central1%252Fconnections%252Fgithub)
2. On GitHub, install the **Cloud Build** GitHub App and grant `alphieoch/ProjectOpenDoor`.
3. Then link the repo and create the trigger:

```bash
gcloud builds repositories create ProjectOpenDoor \
  --remote-uri=https://github.com/alphieoch/ProjectOpenDoor.git \
  --connection=github --region=us-central1 \
  --project=project-800192c2-3ecc-4889-8f7

gcloud builds triggers create github \
  --name=opendoor-main \
  --repository=projects/project-800192c2-3ecc-4889-8f7/locations/us-central1/connections/github/repositories/ProjectOpenDoor \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --region=us-central1 \
  --include-logs-with-status \
  --substitutions='_TAG=$SHORT_SHA,_SITE_ID=opendoor-gcp,_REGION=us-central1,_REPO=opendoor,_SQL_INSTANCE=opendoor-pg,_VPC_CONNECTOR=opendoor-connector' \
  --project=project-800192c2-3ecc-4889-8f7
```

Or import `infra/gcp/cloudbuild.trigger.yaml` after the repo is linked. Confirm with `gcloud builds triggers list --project=project-800192c2-3ecc-4889-8f7`.

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
- After Firebase: `https://opendoor-gcp.web.app/pricing` and `/v1/...`
- Edge LB (no Firebase): `./scripts/setup-edge-lb.sh` then `http://<EDGE_IP>/pricing`
- Ops one-shot: `TOGETHER_API_KEY=... ./scripts/finish-ops.sh`
- Training: `/dashboard/training` after migration `0028`
