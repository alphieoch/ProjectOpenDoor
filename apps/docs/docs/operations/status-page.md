---
sidebar_position: 1
---

# Status Page

OpenDoor provides a public status page powered by [Cachet](https://cachethq.io/) so your team and customers can monitor the health of gateway services, providers, and infrastructure in real time.

---

## Status Page URL

The status page is available at:

```
https://status.opendoor.ai
```

You can also reach it from the dashboard footer or by visiting `/status` on any OpenDoor domain (this redirects to the canonical status URL).

---

## Monitored Components

The status page tracks the following components:

| Component | What It Means | Auto-Updated? |
|---|---|---|
| **Gateway API** | Core LLM proxy and routing layer | ✅ Yes — health endpoint |
| **Dashboard** | Web application and auth services | ✅ Yes — health endpoint |
| **Database** | PostgreSQL primary and replicas | ✅ Yes — connection probe |
| **Redis Cache** | Caching and rate-limiting store | ✅ Yes — connection probe |
| **Azure Foundry** | Azure AI model hosting | ✅ Yes — provider health check |
| **OpenAI** | GPT-4, GPT-3.5, embeddings | ✅ Yes — provider health check |
| **Anthropic** | Claude models | ✅ Yes — provider health check |
| **Cohere** | Command and Embed models | ✅ Yes — provider health check |
| **Mistral** | Mistral and Mixtral models | ✅ Yes — provider health check |

---

## Status Levels

Cachet uses the following status levels:

| Level | Icon | Meaning |
|---|---|---|
| **Operational** | 🟢 | All systems healthy |
| **Performance Issues** | 🟡 | Degraded latency or elevated error rate |
| **Partial Outage** | 🟠 | Some functionality unavailable |
| **Major Outage** | 🔴 | Service completely unavailable |

Status is determined automatically by the gateway health sync job, which runs every 60 seconds. You can also manually update component status from the Cachet admin panel if needed.

---

## Incident History

Past incidents are listed on the status page with:

- Start and end timestamps
- Affected components
- Human-readable description
- Resolution notes

Incidents can be created manually via the Cachet dashboard or automatically via webhook when the gateway detects sustained provider failures.

---

## Subscribing to Alerts

Visitors to the status page can subscribe to email or RSS notifications for:

- New incidents
- Component status changes
- Scheduled maintenance windows

Enterprise customers can additionally configure webhook alerts to Slack, PagerDuty, or Opsgenie via the Cachet admin panel.

---

## Internal Sync Endpoint

The gateway exposes an internal endpoint that pushes health data to Cachet:

```
POST /internal/cachet-sync
```

This endpoint is protected by an optional `x-internal-api-key` header. It is called automatically by a background cron job within the gateway container. You should not need to call it manually unless you are debugging status sync issues.

---

## Customization

Enterprise customers can request:

- Custom branding (logo, colors, domain)
- Additional private components
- Uptime SLA reporting
- Status page embedding (iframe or API)

Contact support to configure these options.
