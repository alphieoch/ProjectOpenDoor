#!/usr/bin/env bash
# Upsert a Secret Manager secret and grant Cloud Run access.
# Usage:
#   TOGETHER_API_KEY=... ./scripts/upsert-gcp-secret.sh opendoor-together-api-key TOGETHER_API_KEY
#   ./scripts/upsert-gcp-secret.sh opendoor-together-api-key   # reads value from stdin
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-project-800192c2-3ecc-4889-8f7}"
SECRET_ID="${1:?secret id required, e.g. opendoor-together-api-key}"
ENV_VAR_NAME="${2:-}"

if [[ -n "$ENV_VAR_NAME" && -n "${!ENV_VAR_NAME:-}" ]]; then
  VALUE="${!ENV_VAR_NAME}"
elif [[ -n "${SECRET_VALUE:-}" ]]; then
  VALUE="$SECRET_VALUE"
else
  echo "Paste secret value for $SECRET_ID (single line), then Ctrl-D:"
  VALUE="$(cat)"
fi

VALUE="$(printf '%s' "$VALUE" | tr -d '\r\n')"
if [[ -z "$VALUE" ]]; then
  echo "Empty secret — abort" >&2
  exit 1
fi

if gcloud secrets describe "$SECRET_ID" --project="$PROJECT" >/dev/null 2>&1; then
  printf '%s' "$VALUE" | gcloud secrets versions add "$SECRET_ID" --data-file=- --project="$PROJECT"
else
  printf '%s' "$VALUE" | gcloud secrets create "$SECRET_ID" --data-file=- --replication-policy=automatic --project="$PROJECT"
fi

# Allow Cloud Run runtime SA to read
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding "$SECRET_ID" \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT" >/dev/null

echo "OK: $SECRET_ID latest version ready"
echo "Redeploy gateway to pick up --set-secrets=TOGETHER_API_KEY=${SECRET_ID}:latest"
echo "  gcloud builds submit --config=infra/gcp/cloudbuild.gateway.yaml --project=$PROJECT"
