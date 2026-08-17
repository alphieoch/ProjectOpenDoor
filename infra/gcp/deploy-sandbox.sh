#!/usr/bin/env bash
# Build and deploy Cloud Run service `opendoor-sandbox` (gVisor jail for workflow code_execution).
#
# Isolation:
#   - Isolated VPC `opendoor-sandbox-vpc` with no Cloud NAT and no Private Google Access
#     (`--vpc-egress=all` → no internet, no Cloud SQL / Redis).
#   - Shared secret CODE_SANDBOX_TOKEN (Secret Manager: opendoor-code-sandbox-token).
#   - Request timeout 15s; in-process exec timeout 10s.
#
# Usage:
#   ./infra/gcp/deploy-sandbox.sh
#   SKIP_BUILD=1 IMAGE=us-central1-docker.pkg.dev/PROJECT/opendoor/sandbox:TAG ./infra/gcp/deploy-sandbox.sh
#
# After deploy, set on opendoor-dashboard (or redeploy dashboard):
#   CODE_SANDBOX_URL=<printed url>
#   CODE_SANDBOX_TOKEN=opendoor-code-sandbox-token:latest
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=cloud-run-env.sh
source "$ROOT/infra/gcp/cloud-run-env.sh"

PROJECT="${GCP_PROJECT_ID:-${OPENDOOR_GCP_PROJECT:-project-800192c2-3ecc-4889-8f7}}"
REGION="${GCP_REGION:-us-central1}"
REPO="${ARTIFACT_REPO:-opendoor}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}"
TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)}"
IMAGE="${IMAGE:-${REGISTRY}/sandbox:${TAG}}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SERVICE="opendoor-sandbox"
NETWORK="${SANDBOX_NETWORK:-opendoor-sandbox-vpc}"
SUBNET="${SANDBOX_SUBNET:-opendoor-sandbox-subnet}"
SUBNET_RANGE="${SANDBOX_SUBNET_RANGE:-10.20.0.0/24}"
SECRET_ID="opendoor-code-sandbox-token"

gcloud config set project "$PROJECT" >/dev/null

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
RUNTIME_SA="${OPENDOOR_RUNTIME_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
RUN_AGENT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"

echo "==> Isolated VPC ${NETWORK} / ${SUBNET} (no NAT, no Private Google Access)"
if ! gcloud compute networks describe "$NETWORK" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute networks create "$NETWORK" \
    --project="$PROJECT" \
    --subnet-mode=custom \
    --bgp-routing-mode=regional \
    --description="OpenDoor code sandbox — no peering, no NAT"
fi
if ! gcloud compute networks subnets describe "$SUBNET" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute networks subnets create "$SUBNET" \
    --project="$PROJECT" \
    --network="$NETWORK" \
    --region="$REGION" \
    --range="$SUBNET_RANGE" \
    --no-enable-private-ip-google-access
fi

# Direct VPC egress needs the Cloud Run service agent on the subnet.
gcloud compute networks subnets add-iam-policy-binding "$SUBNET" \
  --project="$PROJECT" \
  --region="$REGION" \
  --member="serviceAccount:${RUN_AGENT}" \
  --role="roles/compute.networkUser" \
  >/dev/null

echo "==> Secret ${SECRET_ID}"
if ! gcloud secrets describe "$SECRET_ID" --project="$PROJECT" >/dev/null 2>&1; then
  TOKEN="${CODE_SANDBOX_TOKEN:-$(openssl rand -hex 32)}"
  printf '%s' "$TOKEN" | gcloud secrets create "$SECRET_ID" \
    --project="$PROJECT" \
    --data-file=- \
    --replication-policy=automatic
else
  echo "    already exists (not rotated)"
fi
gcloud secrets add-iam-policy-binding "$SECRET_ID" \
  --project="$PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  >/dev/null

if [[ "$SKIP_BUILD" != "1" ]]; then
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" -q
  echo "==> Build ${IMAGE}"
  docker build -f apps/sandbox/Dockerfile -t "$IMAGE" -t "${REGISTRY}/sandbox:latest" apps/sandbox
  echo "==> Push"
  docker push "$IMAGE"
  docker push "${REGISTRY}/sandbox:latest"
fi

echo "==> Deploy Cloud Run ${SERVICE} (gVisor, vpc-egress=all, timeout 15s)"
# --vpc-egress=all + isolated VPC with no Cloud NAT = no internet from guest code.
# Ingress stays public so opendoor-dashboard can call it; auth is CODE_SANDBOX_TOKEN.
CLEAR_FLAGS=()
if gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then
  CLEAR_FLAGS=(--clear-vpc-connector --clear-cloudsql-instances)
fi
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=4 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=15 \
  --no-cpu-throttling \
  --execution-environment=gen2 \
  --network="$NETWORK" \
  --subnet="$SUBNET" \
  --vpc-egress=all \
  "${CLEAR_FLAGS[@]}" \
  --set-env-vars="NODE_ENV=production,PORT=8080" \
  --set-secrets="CODE_SANDBOX_TOKEN=${SECRET_ID}:latest" \
  --quiet

URL=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')

echo ""
echo "Deployed ${SERVICE}"
echo "  URL:    ${URL}"
echo "  Jail:   Cloud Run gVisor (not Firecracker)"
echo "  Secret: ${SECRET_ID} → CODE_SANDBOX_TOKEN"
echo ""
echo "Point the dashboard at this jail, then redeploy opendoor-dashboard:"
echo "  CODE_SANDBOX_URL=${URL}"
echo "  CODE_SANDBOX_TOKEN from Secret Manager ${SECRET_ID}"
echo "  ./scripts/deploy-gcp.sh   # picks up the URL if the service exists"
echo ""
echo "Local fallback (no jail): leave CODE_SANDBOX_URL unset."
