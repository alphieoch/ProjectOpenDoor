# Cloudflare Edge Integration Guide

This guide documents the **Cloudflare Edge + Google Cloud Run + Private Supabase on GCP** architecture.

```
┌─────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│  End User / Web │──────▶│    Cloudflare Edge     │──────▶│    Google Cloud Run    │
│     Browser     │ HTTPS │ (CDN, DDoS, Bot Mgmt,  │ HTTPS │ (Jobboard / Gateway /  │
└─────────────────┘       │  Full Strict Auto-SSL) │       │   Alphonce App API)    │
                          └────────────────────────┘       └───────────┬────────────┘
                                                                       │
                                                   Private VPC Egress  │ Sub-ms Internal
                                                  (10.8.0.0/28 Tunnel) │ Latency
                                                                       ▼
                                                           ┌────────────────────────┐
                                                           │ Supavisor Pooler :6543 │
                                                           │ (10.128.0.2 Private IP)│
                                                           ├────────────────────────┤
                                                           │ PostgreSQL 15 + Vector │
                                                           │ (200 GB pd-ssd Disk)   │
                                                           └────────────────────────┘
```

---

## 1. Cloudflare Configuration Matrix

| Feature | Production Setting | Purpose |
|:---|:---|:---|
| **SSL/TLS Encryption Mode** | **Full (strict)** | Guarantees end-to-end encryption between Cloudflare edge and Cloud Run origin |
| **Always Use HTTPS** | **ON** | Automatically redirects HTTP (`:80`) to HTTPS (`:443`) |
| **Minimum TLS Version** | **TLS 1.2** | Disables deprecated and vulnerable TLS 1.0/1.1 protocols |
| **TLS 1.3** | **ON** | Reduces SSL handshake latency to 1-RTT / 0-RTT |
| **Brotli Compression** | **ON** | Faster asset download and smaller payload sizes than standard gzip |
| **Early Hints** | **ON** | Sends `103 Early Hints` headers to preload critical fonts and stylesheets |
| **HTTP/3 (QUIC)** | **ON** | Maximizes performance and packet-loss resilience on mobile connections |
| **Bot Fight Mode** | **ON** | Blocks automated scrapers and bad bots before they reach Cloud Run |

---

## 2. DNS Routing Configuration

In your Cloudflare dashboard under **DNS &rarr; Records**:

### A. Cloud Run Web App (`jobs.yourdomain.com`)
- **Type**: `CNAME`
- **Name**: `jobs` (or `@` for apex domain)
- **Target**: `ghs.googlehosted.com` (or your service URL `jobboard-*-uc.a.run.app`)
- **Proxy Status**: 🟠 **Proxied (Orange Cloud)**

### B. Supabase Public API Gateway (`api.yourdomain.com`)
- **Type**: `A`
- **Name**: `api`
- **Target**: `35.238.100.26` (VM Caddy Reverse Proxy)
- **Proxy Status**: 🟠 **Proxied (Orange Cloud)**

---

## 3. Automated CLI Execution

You can run the automated Cloudflare edge setup using the built-in CLI tool:

```bash
# Automated Cloudflare configuration
CLOUDFLARE_API_TOKEN="your_api_token" \
CLOUDFLARE_DOMAIN="yourdomain.com" \
pnpm cloudflare:edge
```

---

## 4. Cloud Run Serverless VPC Connector Setup

To ensure Cloud Run reaches the Supabase database via private Google internal IP (`10.128.0.2:6543`):

```bash
# Provision connector and attach to your Cloud Run service
pnpm cloudrun:vpc-connect jobboard
```

This runs `scripts/setup-cloudrun-vpc.sh`, configuring:
1. **Serverless VPC Access Connector**: `opendoor-connector` on `10.8.0.0/28` in `us-central1`.
2. **VPC Egress**: `--vpc-egress=private-ranges-only` (public traffic routes normally, `10.x.x.x` routes privately).
3. **Database URL**: Injects internal Supavisor connection string:
   ```
   DATABASE_URL="postgresql://postgres:<PASSWORD>@10.128.0.2:6543/postgres"
   ```
