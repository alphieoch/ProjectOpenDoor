#!/usr/bin/env bash
# GCP-native edge protection for OpenDoor (no Cloudflare):
#   Cloud Armor (WAF + rate limit + GFE DDoS) on serverless-NEG backends
#   Cloud CDN on the dashboard backend (static/app)
#   HTTPS LB + HTTP→Firebase redirect
#   Cloud DNS: wire a zone only if one already exists (do not create/steal domains)
#
# Firebase Hosting (opendoor-gcp.web.app) stays the public HTTPS frontend so
# WorkOS redirects keep working. Do not geo-block Africa (or any country).
#
# Idempotent. Does not rotate or rewrite Secret Manager values.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${GCP_PROJECT_ID:-project-800192c2-3ecc-4889-8f7}"
REGION="${GCP_REGION:-us-central1}"
EDGE_NAME="${EDGE_NAME:-opendoor-edge}"
ARMOR_NAME="${ARMOR_NAME:-opendoor-armor}"
SSL_POLICY_NAME="${SSL_POLICY_NAME:-opendoor-edge-ssl}"
CERT_NAME="${CERT_NAME:-opendoor-edge-cert}"
REDIRECT_MAP="${REDIRECT_MAP:-opendoor-edge-http-redirect}"
FIREBASE_HOST="${FIREBASE_HOST:-opendoor-gcp.web.app}"

ARMOR_FILE="$ROOT/infra/gcp/armor-policy.yaml"
REDIRECT_FILE="$ROOT/infra/gcp/edge-http-redirect.yaml"

gcloud config set project "$PROJECT" >/dev/null

echo "==> Ensure Compute API"
gcloud services enable compute.googleapis.com --project="$PROJECT" >/dev/null

echo "==> Cloud Armor policy ${ARMOR_NAME}"
if gcloud compute security-policies describe "$ARMOR_NAME" --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute security-policies import "$ARMOR_NAME" \
    --file-name="$ARMOR_FILE" \
    --file-format=yaml \
    --global \
    --project="$PROJECT" \
    --quiet
else
  gcloud compute security-policies create "$ARMOR_NAME" \
    --file-name="$ARMOR_FILE" \
    --file-format=yaml \
    --global \
    --project="$PROJECT"
fi

echo "==> Attach Armor; Cloud CDN on dashboard (static/app), not on gateway API"
if gcloud compute backend-services describe "${EDGE_NAME}-dash-bs" --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute backend-services update "${EDGE_NAME}-dash-bs" \
    --global \
    --security-policy="$ARMOR_NAME" \
    --enable-cdn \
    --cache-mode=CACHE_ALL_STATIC \
    --project="$PROJECT" \
    --quiet
  echo "    ${EDGE_NAME}-dash-bs ← ${ARMOR_NAME} + Cloud CDN (CACHE_ALL_STATIC)"
else
  echo "    skip ${EDGE_NAME}-dash-bs (missing — run scripts/setup-edge-lb.sh first)"
fi
if gcloud compute backend-services describe "${EDGE_NAME}-gw-bs" --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute backend-services update "${EDGE_NAME}-gw-bs" \
    --global \
    --security-policy="$ARMOR_NAME" \
    --no-enable-cdn \
    --project="$PROJECT" \
    --quiet
  echo "    ${EDGE_NAME}-gw-bs ← ${ARMOR_NAME} (CDN off — do not cache /v1)"
else
  echo "    skip ${EDGE_NAME}-gw-bs (missing — run scripts/setup-edge-lb.sh first)"
fi

echo "==> Cloud Armor L7 DDoS (GFE already absorbs volumetric DDoS on the HTTPS LB)"
gcloud compute security-policies update "$ARMOR_NAME" \
  --global \
  --project="$PROJECT" \
  --enable-layer7-ddos-defense \
  --quiet 2>/dev/null || echo "    layer7 DDoS defense skipped (needs Armor Plus; WAF + GFE DDoS still on)"

echo "==> Cloud DNS (list only; do not create a zone for a domain we do not own)"
gcloud services enable dns.googleapis.com --project="$PROJECT" >/dev/null
ZONES=$(gcloud dns managed-zones list --project="$PROJECT" --format='value(name,dnsName)' || true)
if [[ -z "${ZONES}" ]]; then
  echo "    no managed zones in ${PROJECT}. Firebase owns *.web.app. Skip zone create."
else
  echo "$ZONES" | while read -r zname zdns; do
    echo "    existing zone ${zname} (${zdns}) — not rewritten"
  done
fi

echo "==> SSL policy ${SSL_POLICY_NAME} (TLS 1.2+, MODERN — not a country filter)"
if gcloud compute ssl-policies describe "$SSL_POLICY_NAME" --project="$PROJECT" >/dev/null 2>&1; then
  echo "    exists"
else
  gcloud compute ssl-policies create "$SSL_POLICY_NAME" \
    --profile=MODERN \
    --min-tls-version=1.2 \
    --project="$PROJECT"
fi

IP=""
if gcloud compute addresses describe "${EDGE_NAME}-ip" --global --project="$PROJECT" >/dev/null 2>&1; then
  IP=$(gcloud compute addresses describe "${EDGE_NAME}-ip" --global --project="$PROJECT" --format='value(address)')
fi
EDGE_HTTPS_HOST="${EDGE_HTTPS_HOST:-${IP:+${IP}.sslip.io}}"

echo "==> HTTPS cert + proxy (Armor-in-path API URL; Firebase stays the app edge)"
if [[ -n "${EDGE_HTTPS_HOST}" ]]; then
  if gcloud compute ssl-certificates describe "$CERT_NAME" --global --project="$PROJECT" >/dev/null 2>&1; then
    echo "    cert ${CERT_NAME} exists"
  else
    gcloud compute ssl-certificates create "$CERT_NAME" \
      --domains="$EDGE_HTTPS_HOST" \
      --global \
      --project="$PROJECT"
  fi

  if gcloud compute target-https-proxies describe "${EDGE_NAME}-https" --global --project="$PROJECT" >/dev/null 2>&1; then
    gcloud compute target-https-proxies update "${EDGE_NAME}-https" \
      --ssl-certificates="$CERT_NAME" \
      --ssl-policy="$SSL_POLICY_NAME" \
      --url-map="$EDGE_NAME" \
      --global \
      --project="$PROJECT" \
      --quiet
  else
    gcloud compute target-https-proxies create "${EDGE_NAME}-https" \
      --url-map="$EDGE_NAME" \
      --ssl-certificates="$CERT_NAME" \
      --ssl-policy="$SSL_POLICY_NAME" \
      --global \
      --project="$PROJECT"
  fi

  if gcloud compute forwarding-rules describe "${EDGE_NAME}-https-fr" --global --project="$PROJECT" >/dev/null 2>&1; then
    echo "    HTTPS forwarding rule exists"
  else
    gcloud compute forwarding-rules create "${EDGE_NAME}-https-fr" \
      --global \
      --target-https-proxy="${EDGE_NAME}-https" \
      --address="${EDGE_NAME}-ip" \
      --ports=443 \
      --project="$PROJECT"
  fi
else
  echo "    skip HTTPS (no ${EDGE_NAME}-ip). Firebase remains the HTTPS edge."
fi

echo "==> HTTP → https://${FIREBASE_HOST} (no plaintext app/API)"
if gcloud compute url-maps describe "$REDIRECT_MAP" --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute url-maps import "$REDIRECT_MAP" \
    --source="$REDIRECT_FILE" \
    --global \
    --project="$PROJECT" \
    --quiet
else
  # import creates when missing on current gcloud; fall back to a dummy+import if needed
  if ! gcloud compute url-maps import "$REDIRECT_MAP" \
      --source="$REDIRECT_FILE" \
      --global \
      --project="$PROJECT" \
      --quiet 2>/tmp/opendoor-urlmap-import.err; then
    echo "    import-create failed; creating empty map then importing"
    cat /tmp/opendoor-urlmap-import.err >&2 || true
    if gcloud compute backend-services describe "${EDGE_NAME}-dash-bs" --global --project="$PROJECT" >/dev/null 2>&1; then
      gcloud compute url-maps create "$REDIRECT_MAP" \
        --default-service="${EDGE_NAME}-dash-bs" \
        --global \
        --project="$PROJECT"
      gcloud compute url-maps import "$REDIRECT_MAP" \
        --source="$REDIRECT_FILE" \
        --global \
        --project="$PROJECT" \
        --quiet
    fi
  fi
fi

if gcloud compute target-http-proxies describe "${EDGE_NAME}-http" --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute target-http-proxies update "${EDGE_NAME}-http" \
    --url-map="$REDIRECT_MAP" \
    --global \
    --project="$PROJECT" \
    --quiet
  echo "    ${EDGE_NAME}-http now redirects to https://${FIREBASE_HOST}"
fi

echo "==> Cloud Run ingress (Firebase needs dashboard+gateway public; computer/sandbox internal)"
gcloud run services update opendoor-dashboard \
  --region="$REGION" \
  --project="$PROJECT" \
  --ingress=all \
  --quiet
gcloud run services update opendoor-gateway \
  --region="$REGION" \
  --project="$PROJECT" \
  --ingress=all \
  --quiet
# Token-auth callers use fetch + shared secret. On Cloud Run they also send an
# IAM identity token (packages/shared/src/gcp-id-token.ts). Ingress=internal is
# set; allUsers stays until LOCK_PRIVATE_SERVICES=1 after dashboard/gateway deploy.
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
RUNTIME_SA="${OPENDOOR_RUNTIME_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
for svc in opendoor-openbot-computer opendoor-sandbox; do
  gcloud run services update "$svc" \
    --region="$REGION" \
    --project="$PROJECT" \
    --ingress=internal \
    --quiet
  gcloud run services add-iam-policy-binding "$svc" \
    --region="$REGION" \
    --project="$PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/run.invoker" \
    --quiet >/dev/null
  if [[ "${LOCK_PRIVATE_SERVICES:-0}" == "1" ]]; then
    gcloud run services remove-iam-policy-binding "$svc" \
      --region="$REGION" \
      --project="$PROJECT" \
      --member="allUsers" \
      --role="roles/run.invoker" \
      --quiet >/dev/null || true
    echo "    ${svc}: removed allUsers (token + IAM)"
  else
    echo "    ${svc}: ingress=internal, ${RUNTIME_SA} is invoker; allUsers kept until next deploy"
  fi
done

echo ""
echo "OpenDoor GCP security"
echo "  Firebase (HTTPS edge):  https://${FIREBASE_HOST}"
echo "  Armor policy:           ${ARMOR_NAME}"
echo "  Edge IP:                ${IP:-none}"
echo "  Armor HTTPS hostname:   ${EDGE_HTTPS_HOST:-none}  (cert may be PROVISIONING)"
echo "  HTTP on edge IP:        301 → https://${FIREBASE_HOST}"
echo "  Cloud CDN:              ${EDGE_NAME}-dash-bs (CACHE_ALL_STATIC); gateway CDN off"
echo "  Cloud DNS:              no zone in this project (Firebase *.web.app)"
echo "  Computer / sandbox:     ingress=internal (token-auth unchanged)"
echo "  Africa:                 not geo-blocked"
