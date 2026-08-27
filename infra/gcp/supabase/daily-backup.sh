#!/usr/bin/env bash
# Automated Daily PostgreSQL Full Dump Backup to Google Cloud Storage (GCS)
# Runs via cron daily on the Supabase VM.
set -euo pipefail

BUCKET="${GCS_BACKUP_BUCKET:-}"
if [ -z "$BUCKET" ] && [ -f /opt/supabase/.env ]; then
  BUCKET="$(grep GCS_BACKUP_BUCKET /opt/supabase/.env | cut -d= -f2 | tr -d '\"\r\n' || true)"
fi
BUCKET="${BUCKET:-opendoor-supabase-0704-supabase-backups}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
DUMP_FILE="/tmp/supabase-dump-${TIMESTAMP}.sql.gz"

echo "[$(date -u +%FT%TZ)] Starting daily pg_dumpall snapshot..."

# Execute pg_dumpall in db container and compress with gzip
docker exec -i supabase-db pg_dumpall -U postgres | gzip -9 > "$DUMP_FILE"

# Upload to GCS
echo "[$(date -u +%FT%TZ)] Uploading snapshot to gs://${BUCKET}/daily/..."
gcloud storage cp "$DUMP_FILE" "gs://${BUCKET}/daily/supabase-dump-${TIMESTAMP}.sql.gz" || \
  gsutil cp "$DUMP_FILE" "gs://${BUCKET}/daily/supabase-dump-${TIMESTAMP}.sql.gz"

# Remove local temp file
rm -f "$DUMP_FILE"

echo "[$(date -u +%FT%TZ)] Daily backup completed successfully: gs://${BUCKET}/daily/supabase-dump-${TIMESTAMP}.sql.gz"
