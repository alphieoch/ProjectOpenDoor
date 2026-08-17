#!/usr/bin/env bash
# Plain (non-secret) Cloud Run env for OpenDoor.
# Sourced by scripts/deploy-gcp.sh and Cloud Build deploy steps.
#
# gcloud --set-env-vars replaces the entire env list. Every persistable
# key must live here or the next deploy drops it (Web Search price, Vertex, files,
# CODE_SANDBOX_URL when opendoor-sandbox exists).
# Comfy is retired — do not auto-wire PRIVATE_IMAGE_GEN_* to opendoor-comfy.

OPENDOOR_GCP_PROJECT="${OPENDOOR_GCP_PROJECT:-project-800192c2-3ecc-4889-8f7}"
OPENDOOR_FILES_BUCKET="${OPENDOOR_FILES_BUCKET:-opendoor-files-800192c2}"
# Retired Comfy service may still exist (cost). Do not point apps at it.
OPENDOOR_COMFY_MODELS_BUCKET="${OPENDOOR_COMFY_MODELS_BUCKET:-opendoor-comfy-models}"
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
OPENDOOR_RUNTIME_SA="${OPENDOOR_RUNTIME_SA:-930761303874-compute@developer.gserviceaccount.com}"
# International DashScope (Singapore). Beijing keys should set QWEN_BASE_URL to
# https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_BASE_URL="${QWEN_BASE_URL:-https://dashscope-intl.aliyuncs.com/compatible-mode/v1}"

# Test-mode catalog already on opendoor-dashboard (acct_1TSmgXBsJ3MxjFiT).
STRIPE_WEB_SEARCH_ADDON_PRICE_ID="${STRIPE_WEB_SEARCH_ADDON_PRICE_ID:-price_1U5OPSBZaqY5cS2ZgTgkHNDX}"
STRIPE_PRO_PRICE_ID="${STRIPE_PRO_PRICE_ID:-price_1TSml9BZaqY5cS2ZmSmOqFos}"
STRIPE_TEAM_PRICE_ID="${STRIPE_TEAM_PRICE_ID:-price_1U5DlHBZaqY5cS2ZuIQ9xBg9}"
STRIPE_ENTERPRISE_PRICE_ID="${STRIPE_ENTERPRISE_PRICE_ID:-price_1TSn4XBZaqY5cS2Z1hWIeOhR}"
STRIPE_AGENTS_ADDON_PRICE_ID="${STRIPE_AGENTS_ADDON_PRICE_ID:-price_1U5EjsBZaqY5cS2ZnppTPNXA}"
STRIPE_TOPUP_20_PRICE_ID="${STRIPE_TOPUP_20_PRICE_ID:-price_1U5DlIBZaqY5cS2ZOo0RIIsk}"
STRIPE_TOPUP_30_PRICE_ID="${STRIPE_TOPUP_30_PRICE_ID:-price_1TSn4XBZaqY5cS2ZPPnpVrQD}"
STRIPE_TOPUP_50_PRICE_ID="${STRIPE_TOPUP_50_PRICE_ID:-price_1TSn4YBZaqY5cS2ZGriHfNv7}"
STRIPE_TOPUP_100_PRICE_ID="${STRIPE_TOPUP_100_PRICE_ID:-price_1TSn4YBZaqY5cS2ZRA9aLHeY}"
STRIPE_TOPUP_200_PRICE_ID="${STRIPE_TOPUP_200_PRICE_ID:-price_1TSn4ZBZaqY5cS2ZTYcEkFxG}"

opendoor_stripe_env() {
  printf '%s' "STRIPE_WEB_SEARCH_ADDON_PRICE_ID=${STRIPE_WEB_SEARCH_ADDON_PRICE_ID},STRIPE_PRO_PRICE_ID=${STRIPE_PRO_PRICE_ID},STRIPE_TEAM_PRICE_ID=${STRIPE_TEAM_PRICE_ID},STRIPE_ENTERPRISE_PRICE_ID=${STRIPE_ENTERPRISE_PRICE_ID},STRIPE_AGENTS_ADDON_PRICE_ID=${STRIPE_AGENTS_ADDON_PRICE_ID},STRIPE_TOPUP_20_PRICE_ID=${STRIPE_TOPUP_20_PRICE_ID},STRIPE_TOPUP_30_PRICE_ID=${STRIPE_TOPUP_30_PRICE_ID},STRIPE_TOPUP_50_PRICE_ID=${STRIPE_TOPUP_50_PRICE_ID},STRIPE_TOPUP_100_PRICE_ID=${STRIPE_TOPUP_100_PRICE_ID},STRIPE_TOPUP_200_PRICE_ID=${STRIPE_TOPUP_200_PRICE_ID}"
}

# Optional Linear / PostHog public vars. Empty values are omitted so --set-env-vars
# does not wipe the rest of the list.
opendoor_optional_support_env() {
  local out=""
  [[ -n "${NEXT_PUBLIC_POSTHOG_KEY:-}" ]] && out="${out},NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY}"
  [[ -n "${NEXT_PUBLIC_POSTHOG_HOST:-}" ]] && out="${out},NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST}"
  [[ -n "${NEXT_PUBLIC_POSTHOG_UI_HOST:-}" ]] && out="${out},NEXT_PUBLIC_POSTHOG_UI_HOST=${NEXT_PUBLIC_POSTHOG_UI_HOST}"
  [[ -n "${NEXT_PUBLIC_POSTHOG_PROJECT_ID:-}" ]] && out="${out},NEXT_PUBLIC_POSTHOG_PROJECT_ID=${NEXT_PUBLIC_POSTHOG_PROJECT_ID}"
  [[ -n "${POSTHOG_HOST:-}" ]] && out="${out},POSTHOG_HOST=${POSTHOG_HOST}"
  [[ -n "${LINEAR_SUPPORT_TEAM_ID:-}" ]] && out="${out},LINEAR_SUPPORT_TEAM_ID=${LINEAR_SUPPORT_TEAM_ID}"
  printf '%s' "$out"
}

# Usage: opendoor_gateway_env PROJECT REGION INSTANCE_CONNECTION_NAME
opendoor_gateway_env() {
  local project="$1" region="$2" conn="$3"
  printf '%s' "NODE_ENV=production,GCP_PROJECT_ID=${project},GCP_PROJECT=${project},GOOGLE_CLOUD_PROJECT=${project},GCP_REGION=${region},VERTEX_LOCATION=${VERTEX_LOCATION},OPENDOOR_FILES_BUCKET=${OPENDOOR_FILES_BUCKET},QWEN_BASE_URL=${QWEN_BASE_URL},GATEWAY_PORT=3001,INSTANCE_CONNECTION_NAME=${conn},DB_NAME=opendoor,DB_USER=opendoor$(opendoor_private_image_env "$project" "$region")$(opendoor_optional_support_env)"
}

# Cloud Run URL of opendoor-sandbox (gVisor jail). Empty if the service is not deployed.
opendoor_sandbox_url() {
  local project="${1:-$OPENDOOR_GCP_PROJECT}"
  local region="${2:-us-central1}"
  gcloud run services describe opendoor-sandbox \
    --project="$project" \
    --region="$region" \
    --format='value(status.url)' 2>/dev/null || true
}

# Retired: leftover lookup for opendoor-comfy. Do not use for app env.
opendoor_comfy_url() {
  local project="${1:-$OPENDOOR_GCP_PROJECT}"
  local region="${2:-us-central1}"
  local url=""
  url="$(gcloud run services describe opendoor-comfy \
    --project="$project" \
    --region="$region" \
    --format='value(status.url)' 2>/dev/null || true)"
  if [[ -z "$url" && "$region" != "europe-west1" ]]; then
    url="$(gcloud run services describe opendoor-comfy \
      --project="$project" \
      --region=europe-west1 \
      --format='value(status.url)' 2>/dev/null || true)"
  fi
  printf '%s' "$url"
}

# Optional OpenAI-compatible image worker. Never auto-discovers opendoor-comfy.
opendoor_private_image_env() {
  local url="${PRIVATE_IMAGE_GEN_URL:-}"
  if [[ -n "$url" ]]; then
    printf '%s' ",PRIVATE_IMAGE_GEN_URL=${url},PRIVATE_IMAGE_GEN_KIND=${PRIVATE_IMAGE_GEN_KIND:-openai}"
  fi
}

opendoor_gateway_url() {
  local project="${1:-$OPENDOOR_GCP_PROJECT}"
  local region="${2:-us-central1}"
  gcloud run services describe opendoor-gateway \
    --project="$project" \
    --region="$region" \
    --format='value(status.url)' 2>/dev/null || true
}

# Usage: opendoor_dashboard_env PROJECT REGION INSTANCE_CONNECTION_NAME PUBLIC_URL
opendoor_dashboard_env() {
  local project="$1" region="$2" conn="$3" public_url="$4"
  local sandbox_url="${CODE_SANDBOX_URL:-}"
  if [[ -z "$sandbox_url" ]]; then
    sandbox_url="$(opendoor_sandbox_url "$project" "$region" || true)"
  fi
  local extra=""
  if [[ -n "$sandbox_url" ]]; then
    extra=",CODE_SANDBOX_URL=${sandbox_url}"
  fi
  local gateway_url="${GATEWAY_URL:-}"
  if [[ -z "$gateway_url" ]]; then
    gateway_url="$(opendoor_gateway_url "$project" "$region" || true)"
  fi
  if [[ -n "$gateway_url" ]]; then
    extra="${extra},GATEWAY_URL=${gateway_url}"
  fi
  printf '%s' "NODE_ENV=production,GCP_PROJECT_ID=${project},GCP_PROJECT=${project},GOOGLE_CLOUD_PROJECT=${project},GCP_REGION=${region},VERTEX_LOCATION=${VERTEX_LOCATION},NEXT_PUBLIC_APP_URL=${public_url},NEXT_PUBLIC_GATEWAY_URL=${public_url},NEXT_PUBLIC_WORKOS_REDIRECT_URI=${public_url}/callback,HOSTNAME=0.0.0.0,INSTANCE_CONNECTION_NAME=${conn},DB_NAME=opendoor,DB_USER=opendoor,$(opendoor_stripe_env)${extra}$(opendoor_private_image_env "$project" "$region")$(opendoor_optional_support_env)"
}

# Idempotent: create the files bucket and grant the Cloud Run runtime SA objectAdmin.
opendoor_ensure_files_bucket() {
  local project="${1:-$OPENDOOR_GCP_PROJECT}"
  local bucket="${2:-$OPENDOOR_FILES_BUCKET}"
  local sa="${3:-$OPENDOOR_RUNTIME_SA}"
  if ! gcloud storage buckets describe "gs://${bucket}" --project="$project" >/dev/null 2>&1; then
    echo "==> Creating gs://${bucket} (us-central1)"
    gcloud storage buckets create "gs://${bucket}" \
      --project="$project" \
      --location=us-central1 \
      --uniform-bucket-level-access \
      --public-access-prevention
  fi
  gcloud storage buckets add-iam-policy-binding "gs://${bucket}" \
    --member="serviceAccount:${sa}" \
    --role="roles/storage.objectAdmin" \
    --project="$project" >/dev/null
}

# Idempotent: europe-west1 models bucket + runtime SA read (FUSE on opendoor-comfy).
opendoor_ensure_comfy_models_bucket() {
  local project="${1:-$OPENDOOR_GCP_PROJECT}"
  local bucket="${2:-$OPENDOOR_COMFY_MODELS_BUCKET}"
  local sa="${3:-$OPENDOOR_RUNTIME_SA}"
  if ! gcloud storage buckets describe "gs://${bucket}" --project="$project" >/dev/null 2>&1; then
    echo "==> Creating gs://${bucket} (europe-west1)"
    gcloud storage buckets create "gs://${bucket}" \
      --project="$project" \
      --location=europe-west1 \
      --uniform-bucket-level-access \
      --public-access-prevention
  fi
  gcloud storage buckets add-iam-policy-binding "gs://${bucket}" \
    --member="serviceAccount:${sa}" \
    --role="roles/storage.objectAdmin" \
    --project="$project" >/dev/null
}
