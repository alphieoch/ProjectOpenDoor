#!/usr/bin/env bash
# One-time GCP + Firebase bootstrap for OpenDoor.
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-project-800192c2-3ecc-4889-8f7}"
REGION="${GCP_REGION:-us-central1}"
SITE_ID="${FIREBASE_SITE_ID:-opendoor-gcp}"
REPO="${ARTIFACT_REPO:-opendoor}"
SQL_INSTANCE="${SQL_INSTANCE:-opendoor-pg}"
REDIS_INSTANCE="${REDIS_INSTANCE:-opendoor-redis}"
VPC_CONNECTOR="${VPC_CONNECTOR:-opendoor-connector}"

echo "==> Project $PROJECT ($REGION)"
gcloud config set project "$PROJECT" >/dev/null

echo "==> Enable APIs"
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  vpcaccess.googleapis.com \
  compute.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  servicenetworking.googleapis.com \
  storage.googleapis.com \
  --project="$PROJECT"

echo "==> Artifact Registry"
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="OpenDoor container images" \
    --project="$PROJECT"
fi

echo "==> Cloud SQL ($SQL_INSTANCE)"
if ! gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" >/dev/null 2>&1; then
  DB_PASS="${CLOUDSQL_ROOT_PASSWORD:-$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)}"
  mkdir -p infra/gcp/.secrets
  umask 077
  echo "$DB_PASS" > "infra/gcp/.secrets/${SQL_INSTANCE}-root.txt"
  echo "Root password saved to infra/gcp/.secrets/${SQL_INSTANCE}-root.txt (gitignored)"
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --tier=db-custom-1-3840 \
    --region="$REGION" \
    --storage-size=20 \
    --storage-auto-increase \
    --availability-type=ZONAL \
    --root-password="$DB_PASS" \
    --project="$PROJECT" \
    --assign-ip
else
  echo "Cloud SQL already exists"
fi

echo "==> Database + app user"
# Wait until RUNNABLE
for i in $(seq 1 60); do
  STATE=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" --format='value(state)' 2>/dev/null || echo "PENDING")
  [[ "$STATE" == "RUNNABLE" ]] && break
  echo "  waiting for Cloud SQL ($STATE)..."
  sleep 10
done

gcloud sql databases create opendoor --instance="$SQL_INSTANCE" --project="$PROJECT" 2>/dev/null || true
APP_PASS="${CLOUDSQL_APP_PASSWORD:-$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)}"
echo "$APP_PASS" > "infra/gcp/.secrets/${SQL_INSTANCE}-app.txt"
gcloud sql users create opendoor --instance="$SQL_INSTANCE" --password="$APP_PASS" --project="$PROJECT" 2>/dev/null || \
  gcloud sql users set-password opendoor --instance="$SQL_INSTANCE" --password="$APP_PASS" --project="$PROJECT"

CONNECTION_NAME=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" --format='value(connectionName)')
# Cloud Run: use localhost in the URL for Node URL parsing; socket via ?host=
DATABASE_URL="postgresql://opendoor:${APP_PASS}@localhost/opendoor?host=/cloudsql/${CONNECTION_NAME}"

echo "==> VPC connector"
if ! gcloud compute networks vpc-access connectors describe "$VPC_CONNECTOR" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute networks vpc-access connectors create "$VPC_CONNECTOR" \
    --region="$REGION" \
    --network=default \
    --range=10.8.0.0/28 \
    --min-instances=2 \
    --max-instances=3 \
    --machine-type=e2-micro \
    --project="$PROJECT"
fi

echo "==> Memorystore Redis"
if ! gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud redis instances create "$REDIS_INSTANCE" \
    --size=1 \
    --region="$REGION" \
    --redis-version=redis_7_0 \
    --tier=basic \
    --network=default \
    --project="$PROJECT"
fi

for i in $(seq 1 60); do
  RSTATE=$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT" --format='value(state)' 2>/dev/null || echo "CREATING")
  [[ "$RSTATE" == "READY" ]] && break
  echo "  waiting for Redis ($RSTATE)..."
  sleep 10
done

REDIS_HOST=$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT" --format='value(host)')
REDIS_PORT=$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT" --format='value(port)')
REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}"

echo "==> Secret Manager"
upsert_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT" >/dev/null
  else
    echo -n "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --project="$PROJECT"
  fi
}

upsert_secret opendoor-database-url "$DATABASE_URL"
upsert_secret opendoor-redis-url "$REDIS_URL"
upsert_secret opendoor-auth-secret "${AUTH_SECRET:-$(openssl rand -hex 32)}"
upsert_secret opendoor-gateway-hash-secret "${GATEWAY_API_KEY_HASH_SECRET:-$(openssl rand -hex 32)}"
upsert_secret opendoor-code-sandbox-token "${CODE_SANDBOX_TOKEN:-$(openssl rand -hex 32)}"

# Optional keys from env if present (do not overwrite REDIS_URL / DATABASE_URL)
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  source <(grep -E '^(TOGETHER_API_KEY|STRIPE_SECRET_KEY|POSTHOG_API_KEY|LINEAR_API_KEY|AUTH_SECRET|GATEWAY_API_KEY_HASH_SECRET|QWEN_API_KEY)=' .env || true)
  set +a
fi
[[ -n "${TOGETHER_API_KEY:-}" ]] && upsert_secret opendoor-together-api-key "$TOGETHER_API_KEY"
[[ -n "${STRIPE_SECRET_KEY:-}" ]] && upsert_secret opendoor-stripe-secret-key "$STRIPE_SECRET_KEY"
[[ -n "${POSTHOG_API_KEY:-}" ]] && upsert_secret opendoor-posthog-api-key "$POSTHOG_API_KEY"
[[ -n "${LINEAR_API_KEY:-}" ]] && upsert_secret opendoor-linear-api-key "$LINEAR_API_KEY"
[[ -n "${QWEN_API_KEY:-}" ]] && upsert_secret opendoor-qwen-api-key "$QWEN_API_KEY"

# Grant Cloud Run default SA access to secrets + Cloud SQL
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for S in opendoor-database-url opendoor-redis-url opendoor-auth-secret opendoor-gateway-hash-secret opendoor-code-sandbox-token opendoor-qwen-api-key; do
  gcloud secrets describe "$S" --project="$PROJECT" >/dev/null 2>&1 || continue
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT" >/dev/null
done
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudsql.client" \
  --condition=None >/dev/null

echo "==> Files bucket (gateway /v1/files)"
# shellcheck source=../infra/gcp/cloud-run-env.sh
source "$(cd "$(dirname "$0")/.." && pwd)/infra/gcp/cloud-run-env.sh"
OPENDOOR_GCP_PROJECT="$PROJECT"
OPENDOOR_RUNTIME_SA="$RUNTIME_SA"
opendoor_ensure_files_bucket "$PROJECT" "$OPENDOOR_FILES_BUCKET" "$RUNTIME_SA"

echo "==> Firebase"
if ! firebase projects:addfirebase "$PROJECT" 2>/dev/null; then
  echo "NOTE: addFirebase failed — open https://console.firebase.google.com and Add project to $PROJECT, then:"
  echo "  firebase hosting:sites:create $SITE_ID --project $PROJECT"
else
  firebase hosting:sites:create "$SITE_ID" --project "$PROJECT" 2>/dev/null || true
fi

# Write connection helper
cat > infra/gcp/connection.env <<EOF
GCP_PROJECT_ID=$PROJECT
GCP_REGION=$REGION
FIREBASE_SITE_ID=$SITE_ID
CLOUDSQL_CONNECTION_NAME=$CONNECTION_NAME
DATABASE_URL_CLOUD_RUN=$DATABASE_URL
# For local migrate via Auth Proxy (password only — host is 127.0.0.1):
DATABASE_URL_PROXY=postgresql://opendoor:${APP_PASS}@127.0.0.1:5432/opendoor
REDIS_URL=$REDIS_URL
ARTIFACT_REGISTRY=${REGION}-docker.pkg.dev/${PROJECT}/${REPO}
VPC_CONNECTOR=projects/${PROJECT}/locations/${REGION}/connectors/${VPC_CONNECTOR}
EOF
chmod 600 infra/gcp/connection.env

echo ""
echo "Bootstrap complete."
echo "  connection info: infra/gcp/connection.env"
echo "  Next: ./scripts/deploy-gcp.sh"
