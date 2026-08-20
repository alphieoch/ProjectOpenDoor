# OpenDoor Python SDK

Local install only — this package is not published to PyPI.

```bash
pip install -e packages/python-sdk
```

```python
from opendoor import OpenDoor

client = OpenDoor(api_key="opd_...", base_url="https://opendoor-gateway-u5ojp4qjiq-uc.a.run.app")
out = client.chat.completions.create(
    model="gemma-4-26b-a4b-it",
    messages=[{"role": "user", "content": "Hello from OpenDoor"}],
    provider={"order": ["together"], "allow_fallbacks": True},
)
print(out["choices"][0]["message"]["content"])
```

`OPENDOOR_API_KEY` and `OPENDOOR_BASE_URL` are read when constructor args are omitted.

| Method | Gateway path |
| --- | --- |
| `catalog.list` | `GET /v1/catalog` |
| `account.get` / `balance` | `/v1/account` |
| `usage.get` / `rate_limits` | `/v1/usage` |
| `assistants.create` / `chat` | `/v1/assistants` |
| `workflows.run` | `POST /v1/workflows/{id}/run` |
| `plugins.web_search` | `POST /v1/plugins/web-search` |
| `chat.completions.create` | `POST /v1/chat/completions` |
| `models.list` | `GET /v1/models` |
| `generations.get` | `GET /v1/generations/{id}` |
| `images.generate` | `POST /v1/images/generations` |
| `videos.generate` / `get` | `/v1/videos/generations` |
| `audio.transcribe` | `POST /v1/audio/transcriptions` |
| `batches.create` / `get` / `list` | `/v1/batches` |
| `training.jobs` / `datasets` | `/v1/training` |
| `agents.create` / `chat` / `computer` / `restore` | `/v1/agents` |
| `deployments` / `byok` / `policies` | matching `/v1/…` |

Optional `provider=` on chat matches OpenRouter-style routing: `order`, `allow_fallbacks`, `sort`, `only`, `ignore`.
