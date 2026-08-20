# OpenBot computer

MIT-licensed Chromium computer from [CopilotKit/openbot](https://github.com/CopilotKit/openbot).
License: `LICENSE` and `third_party/openbot/NOTICE`.

This process is the browser and `/workspace`. OpenDoor’s gateway decides and audits every action, then calls this service.

```bash
export COMPUTER_TOKEN=opendoor-openbot-dev
bun install
bun run dev   # :4100
```

Prefer the supervisor so each OpenBot gets its own container:

```bash
docker compose up -d openbot-supervisor
```

That builds this image and starts `apps/openbot-supervisor`. Point the gateway at:

```bash
OPENBOT_SUPERVISOR_URL=http://127.0.0.1:4300
OPENBOT_SUPERVISOR_TOKEN=opendoor-openbot-supervisor-dev
OPENBOT_COMPUTER_TOKEN=opendoor-openbot-dev
```

A single shared computer is still available with `docker compose --profile shared-computer up -d openbot-computer` and `OPENBOT_COMPUTER_URL=http://127.0.0.1:4100`.

CopilotKit Intelligence is not used.
