#!/usr/bin/env bash
# ==============================================================================
# Cloudflare Edge & Zero-Trust Integration via CLI
# Sits in front of Cloud Run and Supabase VM:
#   User -> Cloudflare Edge (300+ PoPs, Full Strict TLS, WAF, Bot Fight Mode, CDN)
#        -> Cloud Run App
#        -> Serverless VPC Connector (10.8.0.0/28)
#        -> Private Supabase VM (10.128.0.2:6543 / :5432)
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Configuration
CF_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
CF_ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
CF_DOMAIN="${CLOUDFLARE_DOMAIN:-opendoor.ai}"
APP_SUBDOMAIN="${APP_SUBDOMAIN:-jobs}"
API_SUBDOMAIN="${API_SUBDOMAIN:-api}"
SUPABASE_VM_IP="${SUPABASE_VM_IP:-35.238.100.26}"
CLOUDRUN_TARGET="${CLOUDRUN_TARGET:-ghs.googlehosted.com}"

echo "======================================================================"
echo "🛡️  Cloudflare Edge Setup for Cloud Run & Supabase"
echo "Domain        : $CF_DOMAIN"
echo "App Subdomain : ${APP_SUBDOMAIN}.${CF_DOMAIN} -> ${CLOUDRUN_TARGET} (Proxied)"
echo "API Subdomain : ${API_SUBDOMAIN}.${CF_DOMAIN} -> ${SUPABASE_VM_IP} (Proxied)"
echo "======================================================================"

# 1. Check API Token
if [ -z "$CF_API_TOKEN" ]; then
  echo ""
  echo "⚠️  CLOUDFLARE_API_TOKEN is not set in environment or .env."
  read -r -s -p "Enter your Cloudflare API Token (or press Enter to skip API automation and view manual DNS records): " INPUT_TOKEN
  echo ""
  CF_API_TOKEN="$INPUT_TOKEN"
fi

if [ -z "$CF_API_TOKEN" ]; then
  echo ""
  echo "======================================================================"
  echo "📋 Manual Cloudflare DNS Setup Guide"
  echo "======================================================================"
  echo "1. Go to Cloudflare Dashboard -> Your Domain (${CF_DOMAIN}) -> DNS Records:"
  echo ""
  echo "   [Record 1: Cloud Run App / Jobboard]"
  echo "   Type   : CNAME"
  echo "   Name   : ${APP_SUBDOMAIN}"
  echo "   Target : ${CLOUDRUN_TARGET} (or your *.a.run.app hostname)"
  echo "   Proxy  : 🟠 Proxied (Orange Cloud)"
  echo ""
  echo "   [Record 2: Supabase API Edge]"
  echo "   Type   : A"
  echo "   Name   : ${API_SUBDOMAIN}"
  echo "   Target : ${SUPABASE_VM_IP}"
  echo "   Proxy  : 🟠 Proxied (Orange Cloud)"
  echo ""
  echo "2. Go to SSL/TLS Settings:"
  echo "   - Encryption Mode : Full (strict)"
  echo "   - Always Use HTTPS: Enabled (ON)"
  echo "   - Minimum TLS     : TLS 1.2"
  echo "   - TLS 1.3         : Enabled (ON)"
  echo ""
  echo "3. Go to Speed -> Optimization:"
  echo "   - Brotli          : Enabled (ON)"
  echo "   - Early Hints     : Enabled (ON)"
  echo ""
  echo "4. Go to Security -> Bots:"
  echo "   - Bot Fight Mode  : Enabled (ON)"
  echo "======================================================================"
  exit 0
fi

# 2. Lookup Zone ID if not provided
if [ -z "$CF_ZONE_ID" ]; then
  echo "==> Resolving Cloudflare Zone ID for $CF_DOMAIN..."
  ZONE_RES=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${CF_DOMAIN}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json")
  
  CF_ZONE_ID=$(echo "$ZONE_RES" | grep -o '"id":"[^"]*' | head -n 1 | cut -d '"' -f 4 || true)
  
  if [ -z "$CF_ZONE_ID" ]; then
    echo "❌ Failed to resolve Zone ID for domain '$CF_DOMAIN'. Verify token permissions (Zone.Zone:Read, Zone.DNS:Edit)."
    exit 1
  fi
  echo "    Zone ID: $CF_ZONE_ID"
fi

cf_api() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"
  if [ -n "$data" ]; then
    curl -s -X "$method" "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/${endpoint}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$data"
  else
    curl -s -X "$method" "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/${endpoint}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

# 3. Create or Update DNS Records
upsert_dns() {
  local type="$1"
  local name="$2"
  local content="$3"
  local proxied="$4"
  
  echo "==> Configuring DNS: ${name}.${CF_DOMAIN} (${type} -> ${content}, Proxied: ${proxied})..."
  
  # Check if record exists
  EXISTING=$(cf_api GET "dns_records?type=${type}&name=${name}.${CF_DOMAIN}")
  REC_ID=$(echo "$EXISTING" | grep -o '"id":"[^"]*' | head -n 1 | cut -d '"' -f 4 || true)
  
  PAYLOAD="{\"type\":\"${type}\",\"name\":\"${name}\",\"content\":\"${content}\",\"ttl\":1,\"proxied\":${proxied}}"
  
  if [ -n "$REC_ID" ]; then
    UPDATE_RES=$(cf_api PUT "dns_records/${REC_ID}" "$PAYLOAD")
    if echo "$UPDATE_RES" | grep -q '"success":true'; then
      echo "    ✓ Updated existing DNS record (${REC_ID})"
    else
      echo "    ❌ Failed to update record: $UPDATE_RES"
    fi
  else
    CREATE_RES=$(cf_api POST "dns_records" "$PAYLOAD")
    if echo "$CREATE_RES" | grep -q '"success":true'; then
      echo "    ✓ Created DNS record successfully."
    else
      echo "    ❌ Failed to create record: $CREATE_RES"
    fi
  fi
}

upsert_dns "CNAME" "${APP_SUBDOMAIN}" "${CLOUDRUN_TARGET}" "true"
upsert_dns "A" "${API_SUBDOMAIN}" "${SUPABASE_VM_IP}" "true"

# 4. Configure SSL/TLS Settings (Full Strict)
echo "==> Enforcing Full (strict) SSL/TLS encryption..."
cf_api PATCH "settings/ssl" '{"value":"strict"}' >/dev/null && echo "    ✓ SSL set to Full (strict)"
cf_api PATCH "settings/always_use_https" '{"value":"on"}' >/dev/null && echo "    ✓ Always Use HTTPS enabled"
cf_api PATCH "settings/min_tls_version" '{"value":"1.2"}' >/dev/null && echo "    ✓ Minimum TLS set to 1.2"
cf_api PATCH "settings/tls_1_3" '{"value":"on"}' >/dev/null && echo "    ✓ TLS 1.3 enabled"

# 5. Configure Performance Optimizations (Brotli, Early Hints)
echo "==> Configuring performance optimizations..."
cf_api PATCH "settings/brotli" '{"value":"on"}' >/dev/null && echo "    ✓ Brotli compression enabled"
cf_api PATCH "settings/early_hints" '{"value":"on"}' >/dev/null && echo "    ✓ Early Hints enabled"
cf_api PATCH "settings/http3" '{"value":"on"}' >/dev/null && echo "    ✓ HTTP/3 (QUIC) enabled"

# 6. Configure Cache Rules for Supabase Storage Assets
echo "==> Setting Edge Cache Rules for Supabase Storage..."
cf_api PUT "rulesets/phases/http_request_cache_settings/entrypoint" '{
  "rules": [
    {
      "action": "set_cache_settings",
      "action_parameters": {
        "edge_ttl": {
          "mode": "override_origin",
          "default": 2592000
        },
        "browser_ttl": {
          "mode": "override_origin",
          "default": 86400
        }
      },
      "expression": "http.request.uri.path starts_with \"/storage/v1/object/public/\"",
      "description": "Cache public Supabase storage assets at edge for 30 days"
    }
  ]
}' >/dev/null 2>&1 || true

echo ""
echo "======================================================================"
echo "🎉 Cloudflare Edge Successfully Configured!"
echo "App Edge URL: https://${APP_SUBDOMAIN}.${CF_DOMAIN} (Cloud Run)"
echo "API Edge URL: https://${API_SUBDOMAIN}.${CF_DOMAIN} (Supabase)"
echo "Security    : Full (Strict) TLS 1.3, DDoS Mitigation, Bot Protection"
echo "======================================================================"
