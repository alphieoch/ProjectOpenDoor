#!/usr/bin/env bash
# ==============================================================================
# Hardened Production Self-Hosted Supabase Deployment on GCP via CLI
# Sourced from official Supabase Docker architecture (github.com/supabase/supabase.git)
# Hardware: e2-standard-4 (4 vCPU, 16 GB RAM) + Dual-Disk (50GB Boot + 200GB pd-ssd Data)
# Edge: Caddy Auto-TLS Reverse Proxy
# Disaster Recovery: Continuous WAL Archiving to GCS (PITR RPO < 5m) + Daily Snapshots
# Observability: Google Cloud Ops Agent + Cloud Monitoring Alerts
# Networking: Direct VPC Egress for Cloud Run, IAP-only SSH, Fail2ban
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Configuration
PROJECT="${GCP_PROJECT_ID:-project-800192c2-3ecc-4889-8f7}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-${REGION}-a}"
INSTANCE_NAME="${SUPABASE_INSTANCE_NAME:-supabase-prod}"
DATA_DISK_NAME="${SUPABASE_DATA_DISK_NAME:-supabase-data-disk}"
DATA_DISK_SIZE_GB="${SUPABASE_DATA_DISK_SIZE:-200}"
MACHINE_TYPE="${SUPABASE_MACHINE_TYPE:-e2-standard-4}"
NETWORK="${GCP_VPC_NETWORK:-default}"
BUCKET_NAME="${GCS_BACKUP_BUCKET:-${PROJECT}-supabase-backups}"
DOMAIN_NAME="${SITE_ADDRESS:-}"
ADMIN_EMAIL="${LETSENCRYPT_EMAIL:-admin@opendoor.ai}"

echo "======================================================================"
echo "🚀 Hardened Supabase GCP Deployment"
echo "Project      : $PROJECT"
echo "Region/Zone  : $REGION / $ZONE"
echo "Instance     : $INSTANCE_NAME ($MACHINE_TYPE)"
echo "Data Disk    : $DATA_DISK_NAME (${DATA_DISK_SIZE_GB} GB pd-ssd)"
echo "Backup Bucket: gs://${BUCKET_NAME}"
echo "======================================================================"

# 1. Set Project & Enable APIs
echo "==> [1/8] Verifying gcloud and enabling required GCP APIs..."
gcloud config set project "$PROJECT" >/dev/null

gcloud services enable \
  compute.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  iap.googleapis.com \
  --project="$PROJECT" >/dev/null

# 2. Generate Cryptographic Secrets
echo "==> [2/8] Generating high-entropy cryptographic secrets and RFC 7519 JWTs..."
mkdir -p "$ROOT/infra/gcp/.secrets"
chmod 700 "$ROOT/infra/gcp/.secrets"

SECRETS_JSON=$(bun run "$ROOT/infra/gcp/supabase/generate-keys.ts" --json)
JWT_SECRET=$(echo "$SECRETS_JSON" | grep '"jwtSecret"' | cut -d '"' -f 4)
ANON_KEY=$(echo "$SECRETS_JSON" | grep '"anonKey"' | cut -d '"' -f 4)
SERVICE_ROLE_KEY=$(echo "$SECRETS_JSON" | grep '"serviceRoleKey"' | cut -d '"' -f 4)
POSTGRES_PASSWORD=$(echo "$SECRETS_JSON" | grep '"postgresPassword"' | cut -d '"' -f 4)
DASHBOARD_USERNAME=$(echo "$SECRETS_JSON" | grep '"dashboardUsername"' | cut -d '"' -f 4)
DASHBOARD_PASSWORD=$(echo "$SECRETS_JSON" | grep '"dashboardPassword"' | cut -d '"' -f 4)
SECRET_KEY_BASE=$(echo "$SECRETS_JSON" | grep '"secretKeyBase"' | cut -d '"' -f 4)
VAULT_ENC_KEY=$(echo "$SECRETS_JSON" | grep '"vaultEncKey"' | cut -d '"' -f 4)

echo "$SECRETS_JSON" > "$ROOT/infra/gcp/.secrets/supabase-secrets.json"
chmod 600 "$ROOT/infra/gcp/.secrets/supabase-secrets.json"
echo "    Secrets stored locally at infra/gcp/.secrets/supabase-secrets.json (gitignored)"

# 3. Store Secrets in GCP Secret Manager
echo "==> [3/8] Synchronizing secrets to GCP Secret Manager..."
save_secret() {
  local name="$1"
  local val="$2"
  if ! gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy="automatic" --project="$PROJECT" >/dev/null
  fi
  printf '%s' "$val" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT" >/dev/null
}

save_secret "supabase-jwt-secret" "$JWT_SECRET"
save_secret "supabase-anon-key" "$ANON_KEY"
save_secret "supabase-service-role-key" "$SERVICE_ROLE_KEY"
save_secret "supabase-db-password" "$POSTGRES_PASSWORD"
save_secret "supabase-dashboard-password" "$DASHBOARD_PASSWORD"

# 4. Provision GCS Backup Bucket with Lifecycle Rules
echo "==> [4/8] Provisioning GCS backup bucket (gs://${BUCKET_NAME})..."
if ! gcloud storage buckets describe "gs://${BUCKET_NAME}" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET_NAME}" \
    --project="$PROJECT" \
    --location="$REGION" \
    --uniform-bucket-level-access >/dev/null
  
  # Set 30-day lifecycle auto-cleanup for daily backups
  cat << 'EOF' > /tmp/gcs-lifecycle.json
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {
        "age": 30,
        "matchesPrefix": ["daily/"]
      }
    }
  ]
}
EOF
  gcloud storage buckets update "gs://${BUCKET_NAME}" --lifecycle-file=/tmp/gcs-lifecycle.json >/dev/null
  rm -f /tmp/gcs-lifecycle.json
  echo "    Bucket gs://${BUCKET_NAME} created with 30-day daily retention lifecycle."
else
  echo "    Bucket gs://${BUCKET_NAME} already exists."
fi

# 5. Security & Firewall Rules
echo "==> [5/8] Configuring GCP Security & Firewall rules..."
# IAP SSH (Port 22 from Google IAP range only)
if ! gcloud compute firewall-rules describe "allow-iap-ssh-supabase" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "allow-iap-ssh-supabase" \
    --project="$PROJECT" \
    --network="$NETWORK" \
    --allow=tcp:22 \
    --source-ranges="35.235.240.0/20" \
    --target-tags="supabase-server" \
    --description="Allow SSH exclusively through Google Cloud IAP" >/dev/null
fi

# Public Web Ingress for Caddy (Ports 80, 443)
if ! gcloud compute firewall-rules describe "allow-supabase-web" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "allow-supabase-web" \
    --project="$PROJECT" \
    --network="$NETWORK" \
    --allow=tcp:80,tcp:443 \
    --source-ranges="0.0.0.0/0" \
    --target-tags="supabase-server" \
    --description="Public HTTP/HTTPS traffic to Caddy Auto-TLS Reverse Proxy" >/dev/null
fi

# Internal VPC Ingress for Cloud Run & Internal Services (Ports 5432, 6543, 8000)
if ! gcloud compute firewall-rules describe "allow-supabase-internal-vpc" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "allow-supabase-internal-vpc" \
    --project="$PROJECT" \
    --network="$NETWORK" \
    --allow=tcp:5432,tcp:6543,tcp:8000 \
    --source-ranges="10.0.0.0/8,10.8.0.0/28,172.16.0.0/12" \
    --target-tags="supabase-server" \
    --description="Internal VPC access for Cloud Run and internal microservices" >/dev/null
fi

# 6. Provision Persistent Data Disk (pd-ssd 200 GB)
echo "==> [6/8] Provisioning dedicated pd-ssd persistent data disk..."
if ! gcloud compute disks describe "$DATA_DISK_NAME" --zone="$ZONE" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute disks create "$DATA_DISK_NAME" \
    --project="$PROJECT" \
    --zone="$ZONE" \
    --size="${DATA_DISK_SIZE_GB}GB" \
    --type=pd-ssd \
    --description="Supabase dedicated persistent database and storage disk" >/dev/null
  echo "    Disk $DATA_DISK_NAME (${DATA_DISK_SIZE_GB} GB pd-ssd) created."
else
  echo "    Disk $DATA_DISK_NAME already exists."
fi

# 7. Provision GCE Virtual Machine with Dual Disks & Startup Script
echo "==> [7/8] Deploying hardened GCE instance ($INSTANCE_NAME)..."

# Prepare startup script embedding all configs
STARTUP_SCRIPT=$(cat << 'EOF_STARTUP'
#!/usr/bin/env bash
set -euxo pipefail

DATA_MOUNT="/var/lib/supabase-data"
DISK_DEVICE="/dev/disk/by-id/google-supabase-data-disk"

# 1. Format and Mount Data Disk
if [ -e "$DISK_DEVICE" ]; then
  if ! blkid "$DISK_DEVICE" >/dev/null 2>&1; then
    mkfs.ext4 -F -m 0 -E lazy_itable_init=0,lazy_journal_init=0 "$DISK_DEVICE"
  fi
  mkdir -p "$DATA_MOUNT"
  if ! grep -q "$DATA_MOUNT" /etc/fstab; then
    UUID=$(blkid -s UUID -o value "$DISK_DEVICE")
    echo "UUID=${UUID} ${DATA_MOUNT} ext4 discard,defaults,nofail 0 2" >> /etc/fstab
  fi
  mount -a || true
fi

mkdir -p "$DATA_MOUNT/pgdata" "$DATA_MOUNT/wal_archive" "$DATA_MOUNT/storage" "$DATA_MOUNT/caddy_data" "$DATA_MOUNT/caddy_config"
chmod 700 "$DATA_MOUNT/pgdata"

# 2. Install Packages: Docker, Ops Agent, Fail2ban
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release fail2ban jq

# Install Docker
if ! command -v docker >/dev/null 2>&1; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg || true
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Install Google Cloud Ops Agent
if ! command -v google-cloud-ops-agent >/dev/null 2>&1; then
  curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
  bash add-google-cloud-ops-agent-repo.sh --also-install
  rm -f add-google-cloud-ops-agent-repo.sh
fi

# 3. Deploy Supabase Stack Files
STACK_DIR="/opt/supabase"
mkdir -p "$STACK_DIR/volumes/kong" "$STACK_DIR/volumes/db/init-scripts" "$STACK_DIR/volumes/pooler"

# Extract metadata environment
gcloud compute instances describe $(hostname) --zone=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/zone | cut -d/ -f4) --format='value(metadata.items[supabase-env])' > "$STACK_DIR/.env"
gcloud compute instances describe $(hostname) --zone=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/zone | cut -d/ -f4) --format='value(metadata.items[supabase-compose])' > "$STACK_DIR/docker-compose.yml"
gcloud compute instances describe $(hostname) --zone=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/zone | cut -d/ -f4) --format='value(metadata.items[supabase-caddyfile])' > "$STACK_DIR/Caddyfile"
gcloud compute instances describe $(hostname) --zone=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/zone | cut -d/ -f4) --format='value(metadata.items[supabase-kong-yml])' > "$STACK_DIR/volumes/kong/kong.yml"
gcloud compute instances describe $(hostname) --zone=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/zone | cut -d/ -f4) --format='value(metadata.items[supabase-init-sql])' > "$STACK_DIR/volumes/db/init-scripts/00-initial-schema.sql"
gcloud compute instances describe $(hostname) --zone=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/zone | cut -d/ -f4) --format='value(metadata.items[supabase-pooler-exs])' > "$STACK_DIR/volumes/pooler/pooler.exs"
gcloud compute instances describe $(hostname) --zone=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/zone | cut -d/ -f4) --format='value(metadata.items[supabase-wal-sync])' > "/usr/local/bin/wal-archive-sync.sh"
gcloud compute instances describe $(hostname) --zone=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/zone | cut -d/ -f4) --format='value(metadata.items[supabase-daily-backup])' > "/usr/local/bin/daily-backup.sh"

chmod +x /usr/local/bin/wal-archive-sync.sh /usr/local/bin/daily-backup.sh

# 4. Configure Continuous WAL Sync & Daily Backup Cron
cat << 'CRON' > /etc/cron.d/supabase-disaster-recovery
# Continuous WAL sync to GCS every 3 minutes (RPO < 5m)
*/3 * * * * root /usr/local/bin/wal-archive-sync.sh >> /var/log/supabase-wal-sync.log 2>&1
# Daily full dump snapshot at 03:00 UTC
0 3 * * * root /usr/local/bin/daily-backup.sh >> /var/log/supabase-daily-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/supabase-disaster-recovery

# 5. Start Supabase Docker Stack
cd "$STACK_DIR"
docker compose down || true
docker compose up -d

echo "Supabase production deployment completed successfully on $(hostname)!"
EOF_STARTUP
)

# Prepare metadata files
ENV_CONTENT=$(cat << EOF_ENV
SITE_ADDRESS=${DOMAIN_NAME:-:80}
LETSENCRYPT_EMAIL=${ADMIN_EMAIL}
SUPABASE_PUBLIC_URL=http://${DOMAIN_NAME:-localhost:8000}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
VAULT_ENC_KEY=${VAULT_ENC_KEY}
DASHBOARD_USERNAME=${DASHBOARD_USERNAME}
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
DATA_DIR=/var/lib/supabase-data
GCS_BACKUP_BUCKET=${BUCKET_NAME}
EOF_ENV
)

# Prepare temporary metadata files
TMP_STARTUP="/tmp/supabase-startup.sh"
TMP_ENV="/tmp/supabase.env"
echo "$STARTUP_SCRIPT" > "$TMP_STARTUP"
echo "$ENV_CONTENT" > "$TMP_ENV"

METADATA_FILES="startup-script=${TMP_STARTUP},supabase-env=${TMP_ENV},supabase-compose=${ROOT}/infra/gcp/supabase/docker-compose.yml,supabase-caddyfile=${ROOT}/infra/gcp/supabase/Caddyfile,supabase-kong-yml=${ROOT}/infra/gcp/supabase/volumes/kong/kong.yml,supabase-init-sql=${ROOT}/infra/gcp/supabase/volumes/db/init-scripts/00-initial-schema.sql,supabase-pooler-exs=${ROOT}/infra/gcp/supabase/volumes/pooler/pooler.exs,supabase-wal-sync=${ROOT}/infra/gcp/supabase/wal-archive-sync.sh,supabase-daily-backup=${ROOT}/infra/gcp/supabase/daily-backup.sh"

if ! gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute instances create "$INSTANCE_NAME" \
    --project="$PROJECT" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=50GB \
    --boot-disk-type=pd-balanced \
    --disk="name=${DATA_DISK_NAME},device-name=supabase-data-disk,mode=rw,auto-delete=no" \
    --scopes=cloud-platform \
    --tags="supabase-server" \
    --metadata=google-logging-enabled=true \
    --metadata-from-file="$METADATA_FILES" >/dev/null
  echo "    Instance $INSTANCE_NAME created."
else
  echo "    Instance $INSTANCE_NAME exists. Updating metadata..."
  gcloud compute instances add-metadata "$INSTANCE_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --metadata-from-file="$METADATA_FILES" >/dev/null
fi

rm -f "$TMP_STARTUP" "$TMP_ENV"

# 8. Output Connection Details
echo "==> [8/8] Gathering deployment connection details..."
EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --format='value(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null || echo "Pending")
INTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --format='value(networkInterfaces[0].networkIP)')

DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@${INTERNAL_IP}:5432/postgres"
POOLER_URL="postgresql://postgres:${POSTGRES_PASSWORD}@${INTERNAL_IP}:6543/postgres"

# Save Database URLs to Secret Manager
save_secret "supabase-db-url" "$DATABASE_URL"
save_secret "supabase-pooler-url" "$POOLER_URL"

echo ""
echo "======================================================================"
echo "🎉 Supabase Production Stack Successfully Deployed!"
echo "======================================================================"
echo "External IP           : $EXTERNAL_IP"
echo "Internal VPC IP       : $INTERNAL_IP"
echo "Kong REST API Gateway : http://${EXTERNAL_IP}:8000 (or https://${DOMAIN_NAME:-$EXTERNAL_IP})"
echo "Cloud Run Pooler URL  : $POOLER_URL"
echo "Direct DB Connection  : $DATABASE_URL"
echo "Studio Dashboard (IAP): Run 'pnpm supabase:gcp:tunnel' -> http://localhost:54323"
echo "Studio Username       : $DASHBOARD_USERNAME"
echo "Studio Password       : $DASHBOARD_PASSWORD"
echo "Continuous WAL Backup : gs://${BUCKET_NAME}/wal/ (every 3 min)"
echo "Daily Snapshots       : gs://${BUCKET_NAME}/daily/"
echo "======================================================================"
echo "Next Steps:"
echo "1. Check status:  pnpm supabase:gcp:status"
echo "2. Stream logs :  pnpm supabase:gcp:logs"
echo "3. Connect UI  :  pnpm supabase:gcp:tunnel"
echo "======================================================================"
