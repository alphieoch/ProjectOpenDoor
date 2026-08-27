#!/usr/bin/env bash
# Zone-to-zone failover in us-central1 (no Cloudflare, no geo-block).
#
#   Cloud SQL opendoor-pg     → REGIONAL HA (standby in another zone)
#   Cloud Run                 → regional + min instances (not zonal/city)
#   Memorystore Redis         → leave BASIC (cache-only; no in-place HA)
#   opendoor-edge             → global frontend + regional serverless NEGs
#
# Firebase Hosting stays the public edge. Armor + CDN are not touched.
# Does not rotate or rewrite Secret Manager values.
#
# WARNING: Enabling Cloud SQL REGIONAL HA applies immediately (not deferred
# to the maintenance window) and typically restarts the instance: expect
# several minutes of database unavailability while the standby is created.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${GCP_PROJECT_ID:-project-800192c2-3ecc-4889-8f7}"
REGION="${GCP_REGION:-us-central1}"
SQL_INSTANCE="${SQL_INSTANCE:-opendoor-pg}"
REDIS_INSTANCE="${REDIS_INSTANCE:-opendoor-redis-psa}"
EDGE_NAME="${EDGE_NAME:-opendoor-edge}"

DASH_MIN="${DASHBOARD_MIN_INSTANCES:-2}"
GW_MIN="${GATEWAY_MIN_INSTANCES:-2}"
COMPUTER_MIN="${COMPUTER_MIN_INSTANCES:-1}"

gcloud config set project "$PROJECT" >/dev/null

echo "==> Cloud SQL ${SQL_INSTANCE} (REGIONAL HA)"
SQL_AVAIL=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" \
  --format='value(settings.availabilityType)' 2>/dev/null || echo "MISSING")
if [[ "$SQL_AVAIL" == "MISSING" ]]; then
  echo "    ERROR: ${SQL_INSTANCE} not found — abort (will not create a new DB)."
  exit 1
fi

SQL_BACKUP=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" \
  --format='value(settings.backupConfiguration.enabled)')
SQL_PITR=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" \
  --format='value(settings.backupConfiguration.pointInTimeRecoveryEnabled)')

if [[ "$SQL_AVAIL" == "REGIONAL" && "$SQL_BACKUP" == "True" && "$SQL_PITR" == "True" ]]; then
  echo "    already REGIONAL with backups + PITR"
else
  echo "    WARNING: patch applies NOW (not the Sunday 07:00 UTC maintenance window)."
  echo "    Expect several minutes of Postgres downtime while Cloud SQL adds a standby."
  echo "    Data is not destroyed; connection name and IPs stay the same."
  gcloud sql instances patch "$SQL_INSTANCE" \
    --project="$PROJECT" \
    --availability-type=REGIONAL \
    --backup-start-time=10:00 \
    --enable-point-in-time-recovery \
    --retained-backups-count=7 \
    --maintenance-window-day=SUN \
    --maintenance-window-hour=7 \
    --quiet
fi

echo "==> Cloud Run (regional ${REGION}, min instances)"
# Scaling-only updates — do not --set-env-vars / --set-secrets (would wipe them).
gcloud run services update opendoor-dashboard \
  --project="$PROJECT" --region="$REGION" \
  --min-instances="$DASH_MIN" --quiet
echo "    opendoor-dashboard min=${DASH_MIN}"

gcloud run services update opendoor-gateway \
  --project="$PROJECT" --region="$REGION" \
  --min-instances="$GW_MIN" --quiet
echo "    opendoor-gateway min=${GW_MIN}"

if gcloud run services describe opendoor-openbot-computer \
  --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then
  # Keep --no-cpu-throttling (already required). max=1 stays (shared Chromium).
  gcloud run services update opendoor-openbot-computer \
    --project="$PROJECT" --region="$REGION" \
    --min-instances="$COMPUTER_MIN" \
    --no-cpu-throttling \
    --quiet
  echo "    opendoor-openbot-computer min=${COMPUTER_MIN} no-cpu-throttling (max unchanged)"
else
  echo "    skip opendoor-openbot-computer (not deployed)"
fi

echo "==> Memorystore Redis ${REDIS_INSTANCE}"
if gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  R_TIER=$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT" --format='value(tier)')
  echo "    ${REDIS_INSTANCE} tier=${R_TIER}"
  if [[ "$R_TIER" == "BASIC" ]]; then
    echo "    leave BASIC — Memorystore cannot in-place upgrade to STANDARD_HA"
    echo "    (new instance + new IP = cache flush + REDIS_URL rewrite)."
    echo "    Redis is cache-only; zonal loss is OK (rate-limit / prompt-cache fail open)."
  fi
else
  echo "    ${REDIS_INSTANCE} not found — not creating (would be a new cache)."
fi

echo "==> Load balancer ${EDGE_NAME} (confirm regional serverless NEGs)"
if gcloud compute url-maps describe "$EDGE_NAME" --global --project="$PROJECT" >/dev/null 2>&1; then
  echo "    ${EDGE_NAME} is a global HTTPS URL map (anycast). That is correct."
  echo "    Backends are regional serverless NEGs — Cloud Run spans us-central1 zones."
else
  echo "    ${EDGE_NAME} missing — run ./scripts/setup-edge-lb.sh"
fi

echo ""
echo "==> HA status"
gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" \
  --format='table(name,region,gceZone,secondaryGceZone,settings.availabilityType,state)'
echo
gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT" \
  --format='table(name.basename(),tier,memorySizeGb,locationId,alternativeLocationId,state)' 2>/dev/null \
  || echo "Redis: not STANDARD_HA (see above)"
echo
for svc in opendoor-dashboard opendoor-gateway opendoor-openbot-computer; do
  gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT" \
    --format='table(metadata.name,status.url,spec.template.metadata.annotations["autoscaling.knative.dev/minScale"],spec.template.metadata.annotations["run.googleapis.com/cpu-throttling"])' \
    2>/dev/null || true
done
echo
echo "Desired state: ${ROOT}/infra/gcp/ha.yaml"
echo "Docs:          ${ROOT}/infra/gcp/README.md (Availability-zone failover)"
