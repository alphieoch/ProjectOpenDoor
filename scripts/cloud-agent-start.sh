#!/usr/bin/env bash
# Per-boot Postgres + Redis for Cloud Agents. Does not start the apps (terminals do).
set -euo pipefail

if command -v pg_isready >/dev/null 2>&1; then
  if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    service postgresql start || pg_ctlcluster 16 main start || true
  fi
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"SELECT 1\"" >/dev/null
    su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='opendoor'\"" | grep -q 1 \
      || su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE USER opendoor WITH PASSWORD 'opendoor' SUPERUSER\""
    su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='opendoor'\"" | grep -q 1 \
      || su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE opendoor OWNER opendoor\""
  fi
fi

if command -v redis-cli >/dev/null 2>&1; then
  redis-cli ping >/dev/null 2>&1 || service redis-server start || true
fi

if [[ ! -f .env ]]; then
  echo "NOTE: no .env — copy secrets into the Cursor environment, then cp .env.example .env"
fi
