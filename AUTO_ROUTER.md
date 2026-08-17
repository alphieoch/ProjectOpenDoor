# Auto router

`opendoor/auto`, `openrouter/auto`, and `auto` pick a live serverless/open-weight catalog model (cheapest healthy). Fallback: `gemma-4-26b-a4b-it`, then `deepseek-v3.2`, then `llama3.2:3b`.

Suffixes on `model` (stripped before resolve): `:nitro` → `sort=throughput`, `:floor` → `sort=price`, `:free` → $0 `only` if priced, else `sort=price` + ignore openai/anthropic/azure-foundry/google.

Caller `provider.order` / `allow_fallbacks` are preserved. Wired in `chat.ts` and `completions.ts` via `applyModelRouting`.

See `docs/api-reference/routing.mdx`.
