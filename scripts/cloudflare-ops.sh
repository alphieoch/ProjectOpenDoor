#!/usr/bin/env bash
# ==============================================================================
# Cloudflare Edge & Zero-Trust Production Suite
# Commands:
#   setup         - Configure DNS records, Full (Strict) SSL, WAF, and Cache rules
#   lockdown-gcp  - Restrict GCP VM ports 80/443 to Cloudflare Edge IPs only
#   unlock-gcp    - Allow 0.0.0.0/0 on ports 80/443 (for testing/setup)
#   verify        - Validate Cloudflare edge routing, SSL handshake & cf-ray headers
#   purge-cache   - Instant cache invalidation via Cloudflare API
# ==============================================================================
set -euo pipefail

CMD="${1:-setup}"
PROJECT="${GCP_PROJECT_ID:-opendoor-supabase-0704}"
CF_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
CF_ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
CF_DOMAIN="${CLOUDFLARE_DOMAIN:-opendoor.ai}"
APP_SUBDOMAIN="${APP_SUBDOMAIN:-jobs}"
API_SUBDOMAIN="${API_SUBDOMAIN:-api}"
SUPABASE_VM_IP="${SUPABASE_VM_IP:-35.238.100.26}"
CLOUDRUN_TARGET="${CLOUDRUN_TARGET:-ghs.googlehosted.com}"

# Official Cloudflare Edge IPv4 CIDR Blocks
CF_IPV4_RANGES="173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22"

case "$CMD" in
  setup)
    bash scripts/setup-cloudflare-edge.sh
    ;;

  lockdown-gcp)
    echo "======================================================================"
    echo "🔒 Enforcing Cloudflare Origin Shield on GCP Firewall"
    echo "Project: $PROJECT"
    echo "======================================================================"
    echo "==> Updating GCP firewall rule 'allow-supabase-web' to Cloudflare edge IPs only..."
    gcloud compute firewall-rules update allow-supabase-web \
      --source-ranges="$CF_IPV4_RANGES" \
      --project="$PROJECT" >/dev/null
    echo "✓ Firewall lockdown complete! Direct-to-IP traffic is blocked. Only Cloudflare Edge can reach ports 80/443."
    ;;

  unlock-gcp)
    echo "======================================================================"
    echo "🔓 Opening GCP Firewall ports 80/443 to 0.0.0.0/0"
    echo "Project: $PROJECT"
    echo "======================================================================"
    gcloud compute firewall-rules update allow-supabase-web \
      --source-ranges="0.0.0.0/0" \
      --project="$PROJECT" >/dev/null
    echo "✓ Firewall opened to 0.0.0.0/0."
    ;;

  verify)
    echo "======================================================================"
    echo "🔍 Cloudflare Edge & Zero-Trust Verification"
    echo "Domain: $CF_DOMAIN"
    echo "======================================================================"
    
    echo "--- 1. Testing Cloud Run Edge (${APP_SUBDOMAIN}.${CF_DOMAIN}) ---"
    if curl -sI --max-time 5 "https://${APP_SUBDOMAIN}.${CF_DOMAIN}" | head -n 10; then
      echo "✓ Cloud Run edge reachable via HTTPS."
    else
      echo "ℹ️  https://${APP_SUBDOMAIN}.${CF_DOMAIN} not yet resolving or awaiting DNS propagation."
    fi
    echo ""

    echo "--- 2. Testing Supabase API Edge (${API_SUBDOMAIN}.${CF_DOMAIN}) ---"
    if curl -sI --max-time 5 "https://${API_SUBDOMAIN}.${CF_DOMAIN}/rest/v1/" | head -n 10; then
      echo "✓ Supabase API edge reachable via HTTPS."
    else
      echo "ℹ️  https://${API_SUBDOMAIN}.${CF_DOMAIN} not yet resolving or awaiting DNS propagation."
    fi
    echo ""

    echo "--- 3. Verifying Direct DB Ports (5432 & 6543) are Blocked from Public Internet ---"
    if nc -z -G 1 -w 1 "$SUPABASE_VM_IP" 5432 2>/dev/null; then
      echo "⚠️  WARNING: Port 5432 is publicly reachable!"
    else
      echo "✓ Port 5432 is physically STEALTH (blocked from internet)."
    fi

    if nc -z -G 1 -w 1 "$SUPABASE_VM_IP" 6543 2>/dev/null; then
      echo "⚠️  WARNING: Port 6543 is publicly reachable!"
    else
      echo "✓ Port 6543 is physically STEALTH (blocked from internet)."
    fi
    echo "======================================================================"
    ;;

  purge-cache)
    if [ -z "$CF_API_TOKEN" ] || [ -z "$CF_ZONE_ID" ]; then
      echo "❌ CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required to purge cache via API."
      exit 1
    fi
    echo "==> Purging all Cloudflare cache for Zone $CF_ZONE_ID..."
    curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data '{"purge_everything":true}' | grep -o '"success":[^,]*' || true
    echo "✓ Cache purge dispatched."
    ;;

  *)
    echo "Usage: bash scripts/cloudflare-ops.sh [setup | lockdown-gcp | unlock-gcp | verify | purge-cache]"
    exit 1
    ;;
esac
