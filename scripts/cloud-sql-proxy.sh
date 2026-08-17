#!/usr/bin/env bash
# Start Cloud SQL Auth Proxy for local migrate/seed against production DB.
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-project-800192c2-3ecc-4889-8f7}"
SQL_INSTANCE="${SQL_INSTANCE:-opendoor-pg}"
PORT="${CLOUD_SQL_PROXY_PORT:-5432}"

CONNECTION_NAME=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" --format='value(connectionName)')

if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
  echo "Installing cloud-sql-proxy..."
  curl -fsSL -o /tmp/cloud-sql-proxy \
    "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.15.2/cloud-sql-proxy.darwin.arm64"
  chmod +x /tmp/cloud-sql-proxy
  PROXY=/tmp/cloud-sql-proxy
else
  PROXY=cloud-sql-proxy
fi

echo "Proxying $CONNECTION_NAME on 127.0.0.1:${PORT}"
echo "Use DATABASE_URL from infra/gcp/connection.env (DATABASE_URL_PROXY)"
exec "$PROXY" "${CONNECTION_NAME}" --port="$PORT" --address=127.0.0.1
