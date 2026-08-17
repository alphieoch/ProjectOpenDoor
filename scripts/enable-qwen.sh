#!/usr/bin/env bash
# Store a DashScope key and attach it to gateway + dashboard.
# OpenDoor Chat and playground then call qwen3.8-max (pay-per-token, no GPU).
#
#   QWEN_API_KEY=sk-... ./scripts/enable-qwen.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="${GCP_PROJECT_ID:-project-800192c2-3ecc-4889-8f7}"
REGION="${GCP_REGION:-us-central1}"
# shellcheck source=../infra/gcp/cloud-run-env.sh
source "$ROOT/infra/gcp/cloud-run-env.sh"

if [[ -z "${QWEN_API_KEY:-}" ]]; then
  echo "Set QWEN_API_KEY from Alibaba Cloud Model Studio, then rerun:"
  echo "  https://modelstudio.console.alibabacloud.com/"
  echo "  QWEN_API_KEY=sk-... ./scripts/enable-qwen.sh"
  exit 1
fi

echo "==> Secret opendoor-qwen-api-key"
SECRET_VALUE="$QWEN_API_KEY" bash "$ROOT/scripts/upsert-gcp-secret.sh" opendoor-qwen-api-key

echo "==> Attach to Cloud Run (gateway + dashboard)"
gcloud run services update opendoor-gateway \
  --project="$PROJECT" \
  --region="$REGION" \
  --update-secrets=QWEN_API_KEY=opendoor-qwen-api-key:latest \
  --update-env-vars="QWEN_BASE_URL=${QWEN_BASE_URL}" \
  --quiet

gcloud run services update opendoor-dashboard \
  --project="$PROJECT" \
  --region="$REGION" \
  --update-secrets=QWEN_API_KEY=opendoor-qwen-api-key:latest \
  --quiet

echo ""
echo "Qwen 3.8 Max is live as qwen3.8-max via DashScope (pay-per-token)."
echo "  OpenDoor Chat: /dashboard/chat"
echo "  Gateway:       /v1/chat/completions  model=qwen3.8-max"
echo "  Cost:          ~\$2 / \$6 per 1M tokens (Alibaba list)"
