#!/usr/bin/env bash
# ==============================================================================
# Cloud Run Serverless VPC Connector & Supabase Wiring via CLI
# Connects Cloud Run applications (Jobboard, Gateway, Dashboard) to the private
# Supabase PostgreSQL instance via internal Serverless VPC Connector:
#   Cloud Run -> VPC Connector (10.8.0.0/28) -> Supavisor Pooler (10.128.0.2:6543)
# ==============================================================================
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-opendoor-supabase-0704}"
REGION="${GCP_REGION:-us-central1}"
CONNECTOR_NAME="${VPC_CONNECTOR:-opendoor-connector}"
NETWORK="${GCP_VPC_NETWORK:-default}"
INTERNAL_SUPABASE_IP="${SUPABASE_INTERNAL_IP:-10.128.0.2}"
SUPABASE_POOLER_PORT="6543"
SERVICE_NAME="${1:-jobboard}"
CUSTOM_DOMAIN="${2:-}"

echo "======================================================================"
echo "🔌 Cloud Run to Supabase Private VPC Wiring"
echo "Project      : $PROJECT ($REGION)"
echo "VPC Connector: $CONNECTOR_NAME (10.8.0.0/28)"
echo "Supavisor DB : ${INTERNAL_SUPABASE_IP}:${SUPABASE_POOLER_PORT} (Internal Only)"
echo "Service      : $SERVICE_NAME"
echo "======================================================================"

gcloud config set project "$PROJECT" >/dev/null

# 1. Enable VPC Access API
echo "==> [1/4] Ensuring VPC Access API is enabled..."
gcloud services enable vpcaccess.googleapis.com --project="$PROJECT" >/dev/null

# 2. Provision Serverless VPC Connector
echo "==> [2/4] Verifying Serverless VPC Access Connector ($CONNECTOR_NAME)..."
if ! gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  echo "    Creating VPC Connector $CONNECTOR_NAME..."
  gcloud compute networks vpc-access connectors create "$CONNECTOR_NAME" \
    --region="$REGION" \
    --network="$NETWORK" \
    --range=10.8.0.0/28 \
    --min-instances=2 \
    --max-instances=3 \
    --machine-type=e2-micro \
    --project="$PROJECT" >/dev/null
  echo "    ✓ VPC Connector $CONNECTOR_NAME created."
else
  echo "    ✓ VPC Connector $CONNECTOR_NAME is active."
fi

# 3. Retrieve DB Password from Secret Manager
echo "==> [3/4] Fetching Supabase database credentials from Secret Manager..."
DB_PASS="$(gcloud secrets versions access latest --secret="supabase-db-password" --project="$PROJECT" 2>/dev/null || true)"
if [ -z "$DB_PASS" ]; then
  DB_PASS="45wdVRFPgDqg7Q8ihSWqejGIKzoYNRB"
fi

INTERNAL_DB_URL="postgresql://postgres:${DB_PASS}@${INTERNAL_SUPABASE_IP}:${SUPABASE_POOLER_PORT}/postgres"

# 4. Attach VPC Connector & Database URL to Cloud Run Service
if gcloud run services describe "$SERVICE_NAME" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  echo "==> [4/4] Updating Cloud Run service ($SERVICE_NAME) with VPC Egress and Database URL..."
  gcloud run services update "$SERVICE_NAME" \
    --vpc-connector="$CONNECTOR_NAME" \
    --vpc-egress=private-ranges-only \
    --update-env-vars="DATABASE_URL=${INTERNAL_DB_URL}" \
    --region="$REGION" \
    --project="$PROJECT" >/dev/null
  echo "    ✓ Service $SERVICE_NAME successfully connected to private Supabase DB."
else
  echo "    ℹ️  Service '$SERVICE_NAME' not found in Cloud Run (project: $PROJECT, region: $REGION)."
  echo "       When deploying, pass these flags to your gcloud run deploy command:"
  echo "       --vpc-connector=${CONNECTOR_NAME} --vpc-egress=private-ranges-only --set-env-vars=DATABASE_URL='${INTERNAL_DB_URL}'"
fi

# 5. Optional Cloud Run Custom Domain Mapping
if [ -n "$CUSTOM_DOMAIN" ]; then
  echo "==> Creating Cloud Run Domain Mapping for $CUSTOM_DOMAIN..."
  gcloud beta run domain-mappings create \
    --service="$SERVICE_NAME" \
    --domain="$CUSTOM_DOMAIN" \
    --region="$REGION" \
    --project="$PROJECT" 2>/dev/null || echo "    Domain mapping for $CUSTOM_DOMAIN already exists or is pending."
fi

echo ""
echo "======================================================================"
echo "🎉 Cloud Run Private Supabase Connection Configured!"
echo "Database URL (Private): postgresql://postgres:***@${INTERNAL_SUPABASE_IP}:${SUPABASE_POOLER_PORT}/postgres"
echo "VPC Egress Mode       : private-ranges-only (0.0.0.0/0 stays public, 10.x.x.x routes via VPC)"
echo "======================================================================"
