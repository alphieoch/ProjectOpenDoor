# CLI

```bash
export OPENDOOR_API_KEY=opd_…
export OPENDOOR_BASE_URL=http://localhost:3001
bun run od -- help
```

New commands: `generation get --id`, `images generate --prompt --model`, `videos generate --prompt --model`, `videos get --id`, `audio transcribe --file --model`.

Chat flags: `--provider-sort price|latency|throughput`, `--no-fallbacks`, `--provider-order a,b`.

Canonical page: `docs/getting-started/cli.mdx`.
