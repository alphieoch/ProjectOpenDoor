# OpenDoor on Google Cloud (Firebase Hosting + Cloud Run)

All production traffic is Google-managed:

| Piece | Resource |
|-------|----------|
| Edge | Firebase Hosting site `opendoor-f39a4` (rewrites to Cloud Run) |
| App | Cloud Run `opendoor-dashboard` |
| API | Cloud Run `opendoor-gateway` |
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

## Deploy

Default path uses Cloud Build (avoids local Docker disk issues):

```bash
./scripts/deploy-gcp.sh
# or separately:
gcloud builds submit --config=infra/gcp/cloudbuild.dashboard.yaml
gcloud builds submit --config=infra/gcp/cloudbuild.gateway.yaml
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
