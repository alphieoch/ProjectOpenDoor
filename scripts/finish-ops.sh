#!/usr/bin/env bash
# Finish OpenDoor production ops: Together secret + public HTTPS edge (LB).
# Firebase Hosting remains preferred once org ToS is accepted in console.
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-project-800192c2-3ecc-4889-8f7}"
REGION="${GCP_REGION:-us-central1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Project $PROJECT"

# ── Together API key ──────────────────────────────────────────────────────────
if [[ -n "${TOGETHER_API_KEY:-}" ]]; then
  echo "==> Upserting opendoor-together-api-key"
  SECRET_VALUE="$TOGETHER_API_KEY" bash scripts/upsert-gcp-secret.sh opendoor-together-api-key
  echo "==> Redeploy gateway with Together secret"
  gcloud run services update opendoor-gateway \
    --region="$REGION" \
    --project="$PROJECT" \
    --update-secrets=TOGETHER_API_KEY=opendoor-together-api-key:latest \
    --quiet
else
  echo "NOTE: TOGETHER_API_KEY not set in this shell."
  echo "  export TOGETHER_API_KEY=... && ./scripts/finish-ops.sh"
  echo "  Serverless wholesale + Together fine-tunes stay offline until then."
fi

# ── Public edge: HTTPS Load Balancer (Firebase alternative) ───────────────────
# Firebase addFirebase still 403 until https://console.firebase.google.com ToS.
echo "==> Ensuring serverless NEGs + HTTPS LB (opendoor-edge)"
bash scripts/setup-edge-lb.sh || {
  echo "LB setup skipped/failed — Cloud Run URLs still work."
}

# ── Firebase reminder ─────────────────────────────────────────────────────────
echo ""
echo "==> Firebase Hosting (optional, preferred commercial URL)"
if firebase hosting:sites:list --project="$PROJECT" 2>/dev/null | grep -q opendoor-gcp; then
  firebase deploy --only hosting --project="$PROJECT"
else
  echo "Still blocked until Firebase is linked:"
  echo "  1. Open https://console.firebase.google.com/ → Add project → select $PROJECT → accept ToS"
  echo "  2. firebase login && firebase hosting:sites:create opendoor-gcp --project $PROJECT"
  echo "  3. firebase deploy --only hosting --project $PROJECT"
fi

echo ""
echo "Done. Check:"
echo "  curl \$(gcloud run services describe opendoor-gateway --region=$REGION --project=$PROJECT --format='value(status.url)')/health"
DASH=$(gcloud run services describe opendoor-dashboard --region="$REGION" --project="$PROJECT" --format='value(status.url)')
echo "  Pricing: $DASH/pricing"
echo "  Training UI: $DASH/dashboard/training"
