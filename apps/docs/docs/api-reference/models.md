---
sidebar_position: 2
---

# Models

## List Models

```
GET /v1/models
```

Returns all available models with their deployment status.

## Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer YOUR_API_KEY` |

## Example Request

```bash
curl http://localhost:3001/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Example Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 0,
      "owned_by": "openai",
      "provider": "azure-foundry",
      "deployment_status": "live",
      "display_name": "GPT-4o",
      "supports_vision": true,
      "supports_tools": true,
      "supports_json_mode": true
    },
    {
      "id": "DeepSeek-V4-Pro",
      "object": "model",
      "created": 0,
      "owned_by": "deepseek",
      "provider": "azure-foundry",
      "deployment_status": "coming_soon",
      "display_name": "DeepSeek V4 Pro",
      "supports_vision": false,
      "supports_tools": true,
      "supports_json_mode": true
    }
  ]
}
```

## Deployment Statuses

| Status | Meaning | HTTP Code |
|--------|---------|-----------|
| `live` | Model is deployed and ready | 200 |
| `available_on_request` | Can be deployed on demand | 400 |
| `coming_soon` | Will be available shortly | 400 |

## Filter by Status

Client-side filtering example:

```bash
# Get only live models
curl http://localhost:3001/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY" | \
  jq '.data | map(select(.deployment_status == "live"))'
```
