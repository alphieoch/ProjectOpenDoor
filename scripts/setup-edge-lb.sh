#!/usr/bin/env bash
# Public HTTPS edge via External Application Load Balancer → Cloud Run NEGs.
# Path rules: /v1/* /health /status → gateway; everything else → dashboard.
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-project-800192c2-3ecc-4889-8f7}"
REGION="${GCP_REGION:-us-central1}"
NAME="${EDGE_NAME:-opendoor-edge}"

gcloud config set project "$PROJECT" >/dev/null

ensure_neg() {
  local neg=$1 service=$2
  if gcloud compute network-endpoint-groups describe "$neg" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
    echo "NEG $neg exists"
  else
    gcloud compute network-endpoint-groups create "$neg" \
      --region="$REGION" \
      --network-endpoint-type=serverless \
      --cloud-run-service="$service" \
      --project="$PROJECT"
  fi
}

ensure_backend() {
  local bs=$1 neg=$2
  if gcloud compute backend-services describe "$bs" --global --project="$PROJECT" >/dev/null 2>&1; then
    echo "Backend $bs exists"
  else
    gcloud compute backend-services create "$bs" \
      --global \
      --load-balancing-scheme=EXTERNAL_MANAGED \
      --project="$PROJECT"
    gcloud compute backend-services add-backend "$bs" \
      --global \
      --network-endpoint-group="$neg" \
      --network-endpoint-group-region="$REGION" \
      --project="$PROJECT"
  fi
}

ensure_neg "${NAME}-dash-neg" opendoor-dashboard
ensure_neg "${NAME}-gw-neg" opendoor-gateway
ensure_backend "${NAME}-dash-bs" "${NAME}-dash-neg"
ensure_backend "${NAME}-gw-bs" "${NAME}-gw-neg"

# URL map
if ! gcloud compute url-maps describe "$NAME" --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute url-maps create "$NAME" \
    --default-service="${NAME}-dash-bs" \
    --global \
    --project="$PROJECT"
fi

# Path matcher for API
gcloud compute url-maps add-path-matcher "$NAME" \
  --global \
  --path-matcher-name=api \
  --default-service="${NAME}-dash-bs" \
  --backend-service-path-rules="/v1/*=${NAME}-gw-bs,/health=${NAME}-gw-bs,/status=${NAME}-gw-bs" \
  --project="$PROJECT" 2>/dev/null || true

gcloud compute url-maps set-default-service "$NAME" \
  --default-service="${NAME}-dash-bs" \
  --global \
  --project="$PROJECT" >/dev/null

# Static IP + HTTP proxy (HTTPS needs managed cert + domain)
if ! gcloud compute addresses describe "${NAME}-ip" --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute addresses create "${NAME}-ip" --global --ip-version=IPV4 --project="$PROJECT"
fi
IP=$(gcloud compute addresses describe "${NAME}-ip" --global --project="$PROJECT" --format='value(address)')

if ! gcloud compute target-http-proxies describe "${NAME}-http" --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute target-http-proxies create "${NAME}-http" \
    --url-map="$NAME" \
    --global \
    --project="$PROJECT"
fi

if ! gcloud compute forwarding-rules describe "${NAME}-http-fr" --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute forwarding-rules create "${NAME}-http-fr" \
    --global \
    --target-http-proxy="${NAME}-http" \
    --address="${NAME}-ip" \
    --ports=80 \
    --project="$PROJECT"
fi

echo "Edge IP reserved: ${IP}"
echo "  Firebase Hosting remains the public HTTPS edge (https://opendoor-gcp.web.app)."
echo "  Attach Cloud Armor + HTTPS + HTTP redirect:"
echo "    ./scripts/setup-gcp-security.sh"
