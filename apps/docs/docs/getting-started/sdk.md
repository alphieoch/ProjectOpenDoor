# TypeScript SDK

`@opendoor/sdk` is a small `fetch`-based client. It reads `OPENDOOR_API_KEY` and `OPENDOOR_BASE_URL` (default `http://localhost:3001`).

## Install

```bash
bun add @opendoor/sdk
```

## Usage

```ts
import { OpenDoor } from "@opendoor/sdk";

const client = new OpenDoor();

const chat = await client.chat.completions.create({
  model: "llama-3.1-8b-instruct",
  messages: [{ role: "user", content: "Hello" }],
  provider: { sort: "price", allow_fallbacks: true, order: ["together", "groq"] },
});
```

Also: `models.list()`, `generations.get(id)`, `images.generate()`, `videos.generate()` / `videos.get()`, `audio.transcribe()` (FormData), `batches.create/get/list`, and SSE streaming when `stream: true`.

Canonical page: `docs/getting-started/sdk.mdx`.
