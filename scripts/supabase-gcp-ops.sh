#!/usr/bin/env bash
# ==============================================================================
# Supabase GCP Production CLI Operations Suite
# Commands:
#   status        - Check VM health, Docker container status, disk usage, endpoints
#   logs [svc]    - Stream live container logs via IAP SSH
#   tunnel [type] - Open secure IAP SSH tunnels for Studio (54323) or Postgres (5432)
#   psql          - Launch interactive psql shell directly into production Postgres
#   backup        - Trigger immediate pg_dumpall snapshot and upload to GCS
#   restore-pitr  - Display Point-In-Time-Recovery (PITR) guide and WAL snapshot list
#   restart [svc] - Restart Docker Compose stack or a specific microservice
#   metrics       - Display real-time CPU, RAM, and Disk metrics
# ==============================================================================
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-opendoor-supabase-0704}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-${REGION}-a}"
INSTANCE_NAME="${SUPABASE_INSTANCE_NAME:-supabase-prod}"
BUCKET_NAME="${GCS_BACKUP_BUCKET:-${PROJECT}-supabase-backups}"

gcloud config set project "$PROJECT" >/dev/null 2>&1 || true

cmd="${1:-status}"
shift || true

case "$cmd" in
  status)
    echo "======================================================================"
    echo "🔍 Supabase Production Status ($INSTANCE_NAME)"
    echo "======================================================================"
    
    if ! gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" >/dev/null 2>&1; then
      echo "❌ Instance $INSTANCE_NAME not found in $ZONE ($PROJECT)."
      exit 1
    fi

    STATUS=$(gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --format='value(status)')
    EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --format='value(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null || echo "None")
    INTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --format='value(networkInterfaces[0].networkIP)')

    echo "VM Status     : $STATUS"
    echo "External IP   : $EXTERNAL_IP"
    echo "Internal IP   : $INTERNAL_IP"
    echo ""
    echo "--- Docker Containers (via IAP) ---"
    gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap --command='sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"' 2>/dev/null || echo "Unable to query Docker daemon."
    
    echo ""
    echo "--- Persistent Disk Usage ---"
    gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap --command='sudo df -h /var/lib/supabase-data' 2>/dev/null || echo "Unable to query disk."
    
    echo ""
    echo "--- Disaster Recovery WAL Backups ---"
    gcloud storage ls "gs://${BUCKET_NAME}/daily/" 2>/dev/null | tail -n 3 || echo "No daily backups yet in gs://${BUCKET_NAME}/daily/"
    echo "======================================================================"
    ;;

  logs)
    SVC="${1:-}"
    if [ -n "$SVC" ]; then
      echo "==> Streaming logs for container: supabase-$SVC (Ctrl+C to stop)..."
      gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap --command="sudo docker logs -f --tail 100 supabase-$SVC"
    else
      echo "==> Streaming logs for all Supabase containers (Ctrl+C to stop)..."
      gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap --command="cd /opt/supabase && sudo docker compose logs -f --tail 50"
    fi
    ;;

  tunnel)
    TYPE="${1:-studio}"
    case "$TYPE" in
      studio)
        echo "==> Opening secure IAP tunnel for Supabase Studio UI..."
        echo "    Access Studio at: http://localhost:54323"
        echo "    Press Ctrl+C to close tunnel."
        gcloud compute start-iap-tunnel "$INSTANCE_NAME" 3000 --local-host-port=localhost:54323 --zone="$ZONE" --project="$PROJECT"
        ;;
      db|postgres)
        echo "==> Opening secure IAP tunnel for PostgreSQL database..."
        echo "    Host: localhost, Port: 54320"
        echo "    Press Ctrl+C to close tunnel."
        gcloud compute start-iap-tunnel "$INSTANCE_NAME" 5432 --local-host-port=localhost:54320 --zone="$ZONE" --project="$PROJECT"
        ;;
      pooler)
        echo "==> Opening secure IAP tunnel for Supavisor Pooler..."
        echo "    Host: localhost, Port: 65430"
        echo "    Press Ctrl+C to close tunnel."
        gcloud compute start-iap-tunnel "$INSTANCE_NAME" 6543 --local-host-port=localhost:65430 --zone="$ZONE" --project="$PROJECT"
        ;;
      all)
        echo "==> Opening background IAP tunnels for Studio (54323) and DB (54320)..."
        gcloud compute start-iap-tunnel "$INSTANCE_NAME" 3000 --local-host-port=localhost:54323 --zone="$ZONE" --project="$PROJECT" &
        STUDIO_PID=$!
        gcloud compute start-iap-tunnel "$INSTANCE_NAME" 5432 --local-host-port=localhost:54320 --zone="$ZONE" --project="$PROJECT" &
        DB_PID=$!
        echo "    Studio: http://localhost:54323 (PID $STUDIO_PID)"
        echo "    DB    : localhost:54320 (PID $DB_PID)"
        wait
        ;;
      *)
        echo "Usage: $0 tunnel [studio|db|pooler|all]"
        exit 1
        ;;
    esac
    ;;

  psql)
    echo "==> Launching interactive psql session into Supabase PostgreSQL (via IAP)..."
    gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap -- -t "sudo docker exec -it supabase-db psql -U postgres -d postgres"
    ;;

  backup)
    echo "==> Triggering immediate PostgreSQL full dump backup..."
    gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap --command="sudo /usr/local/bin/daily-backup.sh"
    echo "==> Latest backups on GCS:"
    gcloud storage ls "gs://${BUCKET_NAME}/daily/" | tail -n 5
    ;;

  restore-pitr)
    echo "======================================================================"
    echo "🔄 Point-In-Time Recovery (PITR) Assistant"
    echo "======================================================================"
    echo "Available Base Backups (Daily Snapshots):"
    gcloud storage ls "gs://${BUCKET_NAME}/daily/" || true
    echo ""
    echo "Continuous WAL Archives available in: gs://${BUCKET_NAME}/wal/"
    echo ""
    echo "To restore to a specific timestamp (e.g. '2026-08-26 14:00:00 UTC'):"
    echo "1. Stop postgres container:  cd /opt/supabase && sudo docker compose stop db"
    echo "2. Restore base dump:        gunzip -c snapshot.sql.gz | sudo docker exec -i supabase-db psql -U postgres"
    echo "3. Sync WAL archives:        gcloud storage rsync gs://${BUCKET_NAME}/wal/ /var/lib/supabase-data/wal_archive/"
    echo "4. Set recovery target:      Add recovery_target_time in postgresql.conf"
    echo "5. Restart stack:            cd /opt/supabase && sudo docker compose up -d"
    echo "======================================================================"
    ;;

  restart)
    SVC="${1:-}"
    if [ -n "$SVC" ]; then
      echo "==> Restarting container supabase-$SVC on $INSTANCE_NAME..."
      gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap --command="sudo docker restart supabase-$SVC"
    else
      echo "==> Restarting entire Supabase stack on $INSTANCE_NAME..."
      gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap --command="cd /opt/supabase && sudo docker compose restart"
    fi
    echo "==> Done."
    ;;

  metrics)
    echo "==> Real-time VM Resource Metrics:"
    gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap --command="top -b -n 1 | head -n 15; echo ''; sudo df -h /var/lib/supabase-data; echo ''; free -h"
    ;;

  *)
    echo "Usage: $0 {status|logs|tunnel|psql|backup|restore-pitr|restart|metrics}"
    exit 1
    ;;
esac
