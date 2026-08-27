# Hardened Self-Hosted Supabase on Google Cloud Platform (GCP)

This guide documents the production-hardened self-hosted Supabase architecture deployed to Google Cloud Platform via the `gcloud` CLI, sourced directly from the official [supabase/supabase](https://github.com/supabase/supabase.git) repository specifications.

---

## 1. System Architecture

```
                                  ┌────────────────────────────────────────────────────────────────────────┐
                                  │                        Google Cloud Platform                           │
                                  │                                                                        │
┌──────────────────────────────┐  │  ┌──────────────────────────────────────────────────────────────────┐  │
│   Public Internet / Client   │──┼─▶│ Caddy Reverse Proxy (Auto-TLS / Let's Encrypt on :80 / :443)     │  │
└──────────────────────────────┘  │  └─────────────────────────────────┬────────────────────────────────┘  │
                                  │                                    │                                   │
                                  │  ┌─────────────────────────────────▼────────────────────────────────┐  │
                                  │  │ Kong API Gateway (:8000)                                         │  │
                                  │  │ ├─▶ GoTrue Auth (:9999)      ├─▶ Supabase Realtime (:4000)       │  │
                                  │  │ ├─▶ PostgREST REST (:3000)   ├─▶ Supabase Storage API (:5000)    │  │
                                  │  │ └─▶ Supabase Studio (:3000)  ├─▶ Postgres Meta (:8080)           │  │
                                  │  └─────────────────────────────────┬────────────────────────────────┘  │
                                  │                                    │                                   │
┌──────────────────────────────┐  │  ┌─────────────────────────────────▼────────────────────────────────┐  │
│ Cloud Run / Internal Apps    │──┼─▶│ Supavisor Connection Pooler (:6543)                              │  │
│ (Direct VPC Egress / 10.x)   │  │  └─────────────────────────────────┬────────────────────────────────┘  │
└──────────────────────────────┘  │                                    │                                   │
                                  │  ┌─────────────────────────────────▼────────────────────────────────┐  │
                                  │  │ PostgreSQL 15 Engine + pgvector (:5432)                          │  │
                                  │  │ Mount: /var/lib/supabase-data (200 GB pd-ssd Dedicated Disk)     │  │
                                  │  │ WAL Archiving (archive_command) ──▶ Local Buffer                 │  │
                                  │  └─────────────────────────────────┬────────────────────────────────┘  │
                                  │                                    │ Continuous Sync (Every 3 min)     │
                                  │                                    ▼                                   │
                                  │  ┌──────────────────────────────────────────────────────────────────┐  │
                                  │  │ Cloud Storage (GCS) Backup Bucket                                │  │
                                  │  │ gs://${PROJECT}-supabase-backups/                                │  │
                                  │  │  ├─ wal/      (Continuous WAL Streaming — RPO < 5 min)           │  │
                                  │  │  └─ daily/    (Daily pg_dumpall with 30-day lifecycle)           │  │
                                  │  └──────────────────────────────────────────────────────────────────┘  │
                                  │                                                                        │
                                  │  ┌──────────────────────────────┐    ┌──────────────────────────────┐  │
                                  │  │ Google Cloud Ops Agent       │    │ Security Hardening           │  │
                                  │  │ - Cloud Logging (Docker+Sys) │    │ - IAP SSH (35.235.240.0/20)  │  │
                                  │  │ - Cloud Monitoring Alerts    │    │ - Fail2ban Intrusion Defense │  │
                                  │  │   (Disk > 85%, CPU > 85%)    │    │ - Secret Manager Integration │  │
                                  │  └──────────────────────────────┘    └──────────────────────────────┘  │
                                  └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Hardware & Infrastructure Specifications

- **Compute Instance**: Google Compute Engine `e2-standard-4` (4 vCPUs, 16 GB RAM) in `us-central1-a`.
- **Operating System**: Ubuntu 22.04 LTS (50 GB `pd-balanced` boot disk).
- **Persistent Data Disk**: 200 GB `pd-ssd` (`supabase-data-disk`) formatted as `ext4` and mounted at `/var/lib/supabase-data`.
- **Edge Layer**: Caddy 2.8 reverse proxy handling automated TLS certificate issuance via Let's Encrypt / ZeroSSL.
- **Connection Pooler**: Supavisor on port `6543` for multi-client connection pooling.
- **Disaster Recovery**:
  - Continuous WAL streaming to Google Cloud Storage (`gs://${PROJECT}-supabase-backups/wal/`) ensuring **RPO < 5 minutes**.
  - Automated daily snapshots (`pg_dumpall`) uploaded to `gs://${PROJECT}-supabase-backups/daily/` with 30-day lifecycle expiration.

---

## 3. Quickstart CLI Commands

### 3.1 Deploying the Stack
To deploy the entire production stack in a single automated step:

```bash
pnpm supabase:gcp:deploy
# or
bash scripts/deploy-supabase-gcp.sh
```

### 3.2 Checking Health & Status
```bash
pnpm supabase:gcp:status
```
Displays:
- GCE VM Status & IPs
- Container runtime statuses (Postgres, Kong, GoTrue, PostgREST, Studio, Storage, Realtime, Caddy)
- Disk space utilization on `/var/lib/supabase-data`
- Recent backups on Google Cloud Storage

### 3.3 Streaming Logs
```bash
# Stream all container logs
pnpm supabase:gcp:logs

# Stream logs for a specific service (e.g. auth, db, kong, caddy, rest)
bash scripts/supabase-gcp-ops.sh logs db
bash scripts/supabase-gcp-ops.sh logs auth
```

### 3.4 Secure Supabase Studio Access (IAP Tunnel)
Supabase Studio is not exposed to the public internet by default for security. Access it securely via Google Cloud Identity-Aware Proxy (IAP):

```bash
pnpm supabase:gcp:tunnel studio
```
Then open your browser to **[http://localhost:54323](http://localhost:54323)** and log in with your dashboard admin credentials.

---

## 4. Disaster Recovery & Point-In-Time Recovery (PITR)

### 4.1 Triggering an On-Demand Backup
```bash
pnpm supabase:gcp:backup
```

### 4.2 Point-In-Time Recovery Runbook
If data corruption or accidental table drop occurs:

1. View available snapshots:
   ```bash
   pnpm supabase:gcp:restore-pitr
   ```
2. Stop the database container on the VM:
   ```bash
   gcloud compute ssh supabase-prod --tunnel-through-iap --command="cd /opt/supabase && docker compose stop db"
   ```
3. Restore base snapshot and sync WAL archives from GCS:
   ```bash
   gcloud storage rsync gs://project-800192c2-3ecc-4889-8f7-supabase-backups/wal/ /var/lib/supabase-data/wal_archive/
   ```
4. Set recovery target timestamp in PostgreSQL configuration and restart:
   ```bash
   gcloud compute ssh supabase-prod --tunnel-through-iap --command="cd /opt/supabase && docker compose up -d"
   ```

---

## 5. Connecting Internal Services (Cloud Run Direct VPC Egress)

Internal applications (such as OpenDoor Gateway, Jobboard, or Cloud Run services) should connect directly to Supavisor or Postgres using the internal VPC IP (`10.x.x.x`):

```bash
# High-concurrency pooled connection (Supavisor)
DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@10.128.0.x:6543/postgres"

# Direct connection (Migrations / DDL)
DIRECT_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@10.128.0.x:5432/postgres"
```

Cloud Run services must enable Direct VPC Egress or Serverless VPC Connector:
```bash
gcloud run services update opendoor-gateway \
  --vpc-connector=opendoor-connector \
  --vpc-egress=private-ranges-only
```
This avoids public internet traversal, eliminates egress billing, and provides sub-millisecond latency.

---

## 6. Secrets & Key Management

All generated keys are stored securely in **Google Cloud Secret Manager**:
- `supabase-jwt-secret`: 256-bit HS256 secret.
- `supabase-anon-key`: Signed public JWT token.
- `supabase-service-role-key`: Signed admin token (bypasses RLS).
- `supabase-db-password`: PostgreSQL root/admin password.
- `supabase-db-url`: Internal VPC connection string.
- `supabase-pooler-url`: Internal VPC pooler connection string.

To rotate or re-generate cryptographic tokens locally:
```bash
pnpm supabase:keys:generate
```
