#!/usr/bin/env bash
# Build, push, and deploy OpenDoor dashboard + gateway to Cloud Run, then Firebase Hosting.
#
# Default: Cloud Build (reliable; avoids local Docker disk issues).
# Local Docker: USE_CLOUD_BUILD=0 ./scripts/deploy-gcp.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="${GCP_PROJECT_ID:-project-800192c2-3ecc-4889-8f7}"
REGION="${GCP_REGION:-us-central1}"
SITE_ID="${FIREBASE_SITE_ID:-opendoor-gcp}"
REPO="${ARTIFACT_REPO:-opendoor}"
SQL_INSTANCE="${SQL_INSTANCE:-opendoor-pg}"
VPC_CONNECTOR="${VPC_CONNECTOR:-opendoor-connector}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}"
TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)}"
USE_CLOUD_BUILD="${USE_CLOUD_BUILD:-1}"

# Public URL (Firebase Hosting). Override after custom domain.
PUBLIC_URL="${PUBLIC_URL:-https://${SITE_ID}.web.app}"

# Persist Vertex / files / Stripe catalog across --set-env-vars.
# shellcheck source=../infra/gcp/cloud-run-env.sh
source "$ROOT/infra/gcp/cloud-run-env.sh"
OPENDOOR_GCP_PROJECT="$PROJECT"
opendoor_ensure_files_bucket "$PROJECT" "$OPENDOOR_FILES_BUCKET"

gcloud config set project "$PROJECT" >/dev/null

secret_bindings() {
  local secrets="DATABASE_URL=opendoor-database-url:latest,REDIS_URL=opendoor-redis-url:latest,AUTH_SECRET=opendoor-auth-secret:latest,GATEWAY_API_KEY_HASH_SECRET=opendoor-gateway-hash-secret:latest,DB_PASSWORD=opendoor-db-password:latest"
  if gcloud secrets describe opendoor-together-api-key --project="$PROJECT" >/dev/null 2>&1; then
    secrets="${secrets},TOGETHER_API_KEY=opendoor-together-api-key:latest"
  fi
  if gcloud secrets describe opendoor-stripe-secret-key --project="$PROJECT" >/dev/null 2>&1; then
    secrets="${secrets},STRIPE_SECRET_KEY=opendoor-stripe-secret-key:latest"
  fi
  if gcloud secrets describe opendoor-posthog-api-key --project="$PROJECT" >/dev/null 2>&1; then
    secrets="${secrets},POSTHOG_API_KEY=opendoor-posthog-api-key:latest"
  fi
  if gcloud secrets describe opendoor-linear-api-key --project="$PROJECT" >/dev/null 2>&1; then
    secrets="${secrets},LINEAR_API_KEY=opendoor-linear-api-key:latest"
  fi
  if gcloud secrets describe opendoor-workos-api-key --project="$PROJECT" >/dev/null 2>&1; then
    secrets="${secrets},WORKOS_API_KEY=opendoor-workos-api-key:latest,WORKOS_CLIENT_ID=opendoor-workos-client-id:latest,WORKOS_COOKIE_PASSWORD=opendoor-workos-cookie-password:latest"
  fi
  if gcloud secrets describe opendoor-code-sandbox-token --project="$PROJECT" >/dev/null 2>&1; then
    secrets="${secrets},CODE_SANDBOX_TOKEN=opendoor-code-sandbox-token:latest"
  fi
  if gcloud secrets describe opendoor-qwen-api-key --project="$PROJECT" >/dev/null 2>&1; then
    secrets="${secrets},QWEN_API_KEY=opendoor-qwen-api-key:latest"
  fi
  if gcloud secrets describe opendoor-openbot-computer-token --project="$PROJECT" >/dev/null 2>&1; then
    secrets="${secrets},OPENBOT_COMPUTER_TOKEN=opendoor-openbot-computer-token:latest"
  fi
  secrets="${secrets},INTERNAL_API_KEY=opendoor-internal-api-key:latest,GATEWAY_INTERNAL_KEY=opendoor-internal-api-key:latest"
  printf '%s' "$secrets"
}

deploy_run_services() {
  local connection_name vpc_path secrets
  connection_name=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" --format='value(connectionName)')
  vpc_path="${VPC_CONNECTOR}"
  secrets="$(secret_bindings)"

  echo "==> Deploy gateway (Cloud Run)"
  gcloud run deploy opendoor-gateway \
    --image="${REGISTRY}/gateway:${TAG}" \
    --region="$REGION" \
    --platform=managed \
    --allow-unauthenticated \
    --port=3001 \
    --memory=1Gi \
    --cpu=1 \
    --min-instances=2 \
    --max-instances=20 \
    --timeout=300 \
    --add-cloudsql-instances="$connection_name" \
    --network=default \
    --subnet=default \
    --vpc-egress=private-ranges-only \
    --clear-vpc-connector \
    --set-env-vars="$(opendoor_gateway_env "$PROJECT" "$REGION" "$connection_name")" \
    --set-secrets="${secrets}" \
    --project="$PROJECT"

  echo "==> Deploy dashboard (Cloud Run)"
  gcloud run deploy opendoor-dashboard \
    --image="${REGISTRY}/dashboard:${TAG}" \
    --region="$REGION" \
    --platform=managed \
    --allow-unauthenticated \
    --port=3000 \
    --memory=1Gi \
    --cpu=1 \
    --min-instances=2 \
    --max-instances=20 \
    --timeout=300 \
    --add-cloudsql-instances="$connection_name" \
    --network=default \
    --subnet=default \
    --vpc-egress=private-ranges-only \
    --clear-vpc-connector \
    --set-env-vars="$(opendoor_dashboard_env "$PROJECT" "$REGION" "$connection_name" "$PUBLIC_URL")" \
    --set-secrets="${secrets}" \
    --project="$PROJECT"
}

deploy_firebase_hosting() {
  local gw_url dash_url
  gw_url=$(gcloud run services describe opendoor-gateway --region="$REGION" --project="$PROJECT" --format='value(status.url)')
  dash_url=$(gcloud run services describe opendoor-dashboard --region="$REGION" --project="$PROJECT" --format='value(status.url)')

  echo "==> Firebase Hosting rewrites"
  if ! command -v firebase >/dev/null 2>&1; then
    echo "firebase CLI not installed — skip hosting deploy"
    echo "  dashboard: $dash_url"
    echo "  gateway:   $gw_url"
    return 0
  fi

  if firebase hosting:sites:list --project="$PROJECT" 2>/dev/null | grep -q "$SITE_ID"; then
    firebase deploy --only hosting --project="$PROJECT"
    return 0
  fi

  echo "Hosting site '$SITE_ID' missing. After Firebase is linked to this GCP project:"
  echo "  1. Open https://console.firebase.google.com/ and add Firebase to $PROJECT (accept ToS)"
  echo "  2. firebase login"
  echo "  3. firebase hosting:sites:create $SITE_ID --project $PROJECT"
  echo "  4. firebase deploy --only hosting --project $PROJECT"
  echo "Direct Cloud Run URLs (usable now):"
  echo "  dashboard: $dash_url"
  echo "  gateway:   $gw_url"
}

if [[ "$USE_CLOUD_BUILD" == "1" ]]; then
  echo "==> Cloud Build (dashboard + gateway) tag=${TAG}"
  gcloud builds submit \
    --config=cloudbuild.yaml \
    --substitutions="_TAG=${TAG},_SITE_ID=${SITE_ID},_REGION=${REGION},_REPO=${REPO},_SQL_INSTANCE=${SQL_INSTANCE},_VPC_CONNECTOR=${VPC_CONNECTOR}" \
    --project="$PROJECT"
else
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" -q

  echo "==> Build dashboard (local Docker)"
  docker build \
    -f apps/dashboard/Dockerfile \
    --build-arg "NEXT_PUBLIC_APP_URL=${PUBLIC_URL}" \
    --build-arg "NEXT_PUBLIC_GATEWAY_URL=${PUBLIC_URL}" \
    --build-arg "NEXT_PUBLIC_WORKOS_REDIRECT_URI=${PUBLIC_URL}/callback" \
    -t "${REGISTRY}/dashboard:${TAG}" \
    -t "${REGISTRY}/dashboard:latest" \
    .

  echo "==> Build gateway (local Docker)"
  docker build \
    -f apps/gateway/Dockerfile \
    -t "${REGISTRY}/gateway:${TAG}" \
    -t "${REGISTRY}/gateway:latest" \
    .

  echo "==> Push images"
  docker push "${REGISTRY}/dashboard:${TAG}"
  docker push "${REGISTRY}/dashboard:latest"
  docker push "${REGISTRY}/gateway:${TAG}"
  docker push "${REGISTRY}/gateway:latest"

  deploy_run_services
fi

deploy_firebase_hosting

GW_URL=$(gcloud run services describe opendoor-gateway --region="$REGION" --project="$PROJECT" --format='value(status.url)')
DASH_URL=$(gcloud run services describe opendoor-dashboard --region="$REGION" --project="$PROJECT" --format='value(status.url)')

echo ""
echo "Deployed tag ${TAG}"
echo "  Public (Firebase): ${PUBLIC_URL}"
echo "  Dashboard Run:     ${DASH_URL}"
echo "  Gateway Run:       ${GW_URL}"
SANDBOX_URL=$(gcloud run services describe opendoor-sandbox --region="$REGION" --project="$PROJECT" --format='value(status.url)' 2>/dev/null || true)
if [[ -n "$SANDBOX_URL" ]]; then
  echo "  Sandbox Run:       ${SANDBOX_URL}"
else
  echo "  Sandbox Run:       (not deployed — workflow code_execution uses local subprocess)"
  echo "  Deploy jail:       gcloud builds submit --config=infra/gcp/cloudbuild.sandbox.yaml"
fi
COMPUTER_URL=$(gcloud run services describe opendoor-openbot-computer --region="$REGION" --project="$PROJECT" --format='value(status.url)' 2>/dev/null || true)
if [[ -n "$COMPUTER_URL" ]]; then
  echo "  OpenBot computer:  ${COMPUTER_URL}"
else
  echo "  OpenBot computer:  (not deployed — live click/screenshot stays local)"
fi
echo "  Studio images:     OpenDoor /v1/images/generations (Comfy retired; not wired)"
