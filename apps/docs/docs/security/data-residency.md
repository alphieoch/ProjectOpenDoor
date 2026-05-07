---
sidebar_position: 2
---

# Data Residency

OpenDoor is deployed across multiple Azure regions. Data residency controls let you specify where request payloads, logs, and fine-tuning data are physically stored and processed.

---

## Available Regions

| Region | Location | Status |
|---|---|---|
| `westeurope` | Netherlands | ✅ Primary — default for EU customers |
| `eastus` | Virginia, USA | ✅ Secondary — default for US customers |

Additional regions can be enabled on request for Enterprise plans.

---

## What Stays In-Region

When you pin an organization or API key to a specific region, the following data never leaves that geography:

- **Request/response payloads** — the actual prompt and completion text
- **Log entries** — audit trails and request metadata
- **Embeddings cache** — cached vector results
- **Fine-tuning datasets** — uploaded training files
- **Analytics aggregates** — usage and latency rollups

The following may cross regions by design:

- **Stripe billing data** — stored in Stripe’s US infrastructure
- **Cachet status page metrics** — aggregated globally for status accuracy
- **Container image registries** — ACR geo-replication for fast deployments

---

## Setting Region Affinity

### Organization-Level

Set the default region for your entire organization in **Settings → Compliance → Data Residency**.

All new API keys will inherit this setting. Existing keys are not automatically migrated — you must rotate them if you want to enforce residency retroactively.

### API Key-Level

Override the organization default on a per-key basis:

1. Go to **API Keys**.
2. Edit the key.
3. Under **Advanced**, select **Region**.
4. Choose the desired region from the dropdown.

### Request Header

For dynamic routing (Enterprise only), include the region preference in the request header:

```bash
curl https://api.opendoor.ai/v1/chat/completions \
  -H "Authorization: Bearer sk-xxxxxxxx" \
  -H "X-OpenDoor-Region: westeurope" \
  -d '{ ... }'
```

If the requested region is unavailable, the gateway returns a `503` with a `Retry-After` header pointing to the closest healthy region.

---

## Compliance Mappings

| Framework | Requirement | OpenDoor Control |
|---|---|---|
| GDPR Article 44 | Data transfer outside EU | EU region pinning + no cross-border replication |
| HIPAA §164.312 | Access control + audit logs | Regional RBAC + in-region audit retention |
| SOC 2 Type II | Logical separation | Per-region managed environments |
| ISO 27001 | Asset management | Region-tagged resource groups + Azure Policy enforcement |

---

## Cross-Region Failover

By default, if your pinned region experiences an outage, OpenDoor fails over to the secondary region. You can disable this behavior in **Settings → Compliance → Failover** if your compliance posture requires hard region boundaries. When failover is disabled, requests to an unhealthy region will error rather than route elsewhere.

---

## Verification

You can verify where a specific request was processed by checking the response headers:

```
X-OpenDoor-Region: westeurope
X-OpenDoor-Processed-At: 2026-05-07T14:32:11Z
```

These headers are present on every API response and can be logged by your client for audit purposes.
