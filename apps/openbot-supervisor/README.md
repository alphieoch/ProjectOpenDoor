# OpenBot computer supervisor

MIT-licensed per-Bot container supervisor from [CopilotKit/openbot](https://github.com/CopilotKit/openbot).
License: `LICENSE` and `third_party/openbot/NOTICE`.

This is the only process that holds the Docker socket. It exposes four verbs: **ensure**, **stop**, **reset**, **list**. Each OpenBot gets its own Chromium container, `/workspace` volume, and browser profile. The gateway never talks to Docker.

```bash
# Build the computer image the supervisor will launch
docker compose build openbot-computer

# Start the supervisor (publishes :4300 on loopback)
docker compose up -d openbot-supervisor
```

Point the gateway and dashboard at it:

```bash
OPENBOT_SUPERVISOR_URL=http://127.0.0.1:4300
OPENBOT_SUPERVISOR_TOKEN=opendoor-openbot-supervisor-dev
OPENBOT_COMPUTER_TOKEN=opendoor-openbot-dev
```

Starting an OpenBot then creates `opendoor-computer-<agent-id>`. Stopping the agent stops that container. Files stay on the workspace volume.

Optional kernel isolation, when the host has [gVisor](https://gvisor.dev/):

```bash
OPENBOT_COMPUTER_RUNTIME=runsc
```

CopilotKit Intelligence and SPIRE are not required.
