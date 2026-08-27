#!/usr/bin/env bash
# Continuous WAL Archive Sync to Google Cloud Storage (GCS)
# Runs via systemd timer or cron every 2-5 minutes on the Supabase VM.
# Ensures Point-In-Time Recovery (PITR) with Recovery Point Objective (RPO) < 5 minutes.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/supabase-data}"
WAL_DIR="${DATA_DIR}/wal_archive"
BUCKET="${GCS_BACKUP_BUCKET:-}"
if [ -z "$BUCKET" ] && [ -f /opt/supabase/.env ]; then
  BUCKET="$(grep GCS_BACKUP_BUCKET /opt/supabase/.env | cut -d= -f2 | tr -d '\"\r\n' || true)"
fi
BUCKET="${BUCKET:-opendoor-supabase-0704-supabase-backups}"

if [ ! -d "$WAL_DIR" ]; then
  mkdir -p "$WAL_DIR"
fi

# Sync new WAL files to GCS bucket
if [ -n "$(ls -A "$WAL_DIR" 2>/dev/null)" ]; then
  echo "[$(date -u +%FT%TZ)] Syncing WAL archives to gs://${BUCKET}/wal/..."
  gcloud storage rsync "$WAL_DIR" "gs://${BUCKET}/wal/" --recursive --quiet || \
    gsutil -m rsync -r "$WAL_DIR" "gs://${BUCKET}/wal/"

  # Prune local WAL files that are older than 3 days to conserve disk space
  find "$WAL_DIR" -type f -mtime +3 -delete 2>/dev/null || true
fi
