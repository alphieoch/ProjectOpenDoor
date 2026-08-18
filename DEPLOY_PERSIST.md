# OpenDoor deploy persistence (Vertex / files / Web Search)

Do not commit `.env` or secrets. Do not touch SokoHut / J&L Supabase.

`--set-env-vars` on Cloud Run **replaces** the whole env list. Persistable keys live in `infra/gcp/cloud-run-env.sh` and are sourced by:

- `scripts/deploy-gcp.sh` (Cloud Build default + local Docker path)
- `cloudbuild.yaml`
- `infra/gcp/cloudbuild.gateway.yaml`
- `infra/gcp/cloudbuild.dashboard.yaml`
- `scripts/bootstrap-gcp.sh` (files bucket only)

## Live Cloud Run (this run)

Project `project-800192c2-3ecc-4889-8f7`, region `us-central1`, runtime SA `930761303874-compute@developer.gserviceaccount.com`.

| Service | Added / kept |
|---|---|
| `opendoor-gateway` | `GOOGLE_CLOUD_PROJECT`, `GCP_PROJECT`, `GCP_PROJECT_ID`, `VERTEX_LOCATION=global`, `OPENDOOR_FILES_BUCKET=opendoor-files-800192c2` |
| `opendoor-dashboard` | Existing Stripe catalog kept, plus `GOOGLE_CLOUD_PROJECT`, `GCP_PROJECT`, `VERTEX_LOCATION=global`, `STRIPE_WEB_SEARCH_ADDON_PRICE_ID=price_1U5OPSBZaqY5cS2ZgTgkHNDX`, and `CODE_SANDBOX_URL` when `opendoor-sandbox` exists |
| `opendoor-sandbox` | `CODE_SANDBOX_TOKEN` from Secret Manager `opendoor-code-sandbox-token`. Isolated VPC, `--vpc-egress=all`, no NAT. |
| `opendoor-comfy` | **Retired.** Cloud Run GPU may still exist (cost). Do not point gateway/dashboard at it. Studio uses OpenDoor APIs → `/v1/images/generations`. |
| `opendoor-gateway` + `opendoor-dashboard` | Do **not** set `PRIVATE_IMAGE_GEN_URL` to `opendoor-comfy`. Optional `PRIVATE_IMAGE_GEN_URL` is an OpenAI-compatible image server (`PRIVATE_IMAGE_GEN_KIND=openai`). |

Dashboard does not set `OPENDOOR_FILES_BUCKET` (files API is gateway-only).

Comfy is retired as the product/default image backend. Leave the Cloud Run service if you want (cost); deploy no longer wires `PRIVATE_IMAGE_GEN_*` to it.

## Files bucket

| | |
|---|---|
| Name | `opendoor-files-800192c2` |
| Location | `us-central1` (regional), uniform bucket-level access, public access prevention |
| IAM | `930761303874-compute@developer.gserviceaccount.com` → `roles/storage.objectAdmin` |

Recreate / repair:

```bash
gcloud storage buckets create gs://opendoor-files-800192c2 \
  --project=project-800192c2-3ecc-4889-8f7 \
  --location=us-central1 \
  --uniform-bucket-level-access \
  --public-access-prevention

gcloud storage buckets add-iam-policy-binding gs://opendoor-files-800192c2 \
  --member="serviceAccount:930761303874-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin" \
  --project=project-800192c2-3ecc-4889-8f7
```

## Stripe

Test Web Search price `price_1U5OPSBZaqY5cS2ZgTgkHNDX` is on `opendoor-dashboard` and in deploy `--set-env-vars`.

**Live catalog still blocked.** Stripe MCP this session is OpenMart (`acct_1TVKC5Dt4zc2Hm5e`), not Project opendoor (`acct_1TSmgXBsJ3MxjFiT`). No live product was created.

## Together

No Together secret created. Vertex is replacing it. Optional `opendoor-together-api-key` binding remains in deploy scripts if that secret already exists.

## Still blocked

- OpenDoor **live** Stripe Web Search price (wrong MCP account / test price is live on Cloud Run)
- Together API key (intentionally skipped)
- Firebase Hosting is **live** at https://opendoor-gcp.web.app (`opendoor-f39a4` is a sibling project)
