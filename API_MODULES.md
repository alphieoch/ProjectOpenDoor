# Isolated API modules — **wired**

Plugins, responses, and files are mounted on the gateway (`apps/gateway/src/index.ts`). Auth is already applied by `app.use("/v1/*", authMiddleware)`.

```ts
import pluginsRouter from "./routes/plugins.js";
import responsesRouter from "./routes/responses.js";
import filesRouter from "./routes/files.js";
app.route("/v1/plugins", pluginsRouter);
app.route("/v1/responses", responsesRouter);
app.route("/v1/files", filesRouter);
```

## Env vars

| Var | Module | Required |
|-----|--------|----------|
| `TAVILY_API_KEY` | Web search (preferred) | One of the three search keys |
| `BRAVE_SEARCH_API_KEY` | Web search (fallback) | |
| `SERPER_API_KEY` | Web search (fallback) | |
| `OPENDOOR_FILES_DIR` | Files | No — default `tmp/opendoor-files` under cwd |
| `OPENDOOR_FILES_BUCKET` | Files (GCS) | No — if unset, local disk. Also reads `GCS_FILES_BUCKET` / `GCS_BUCKET` |

Responses uses the same provider path as chat (Vertex ADC / `GOOGLE_CLOUD_PROJECT`, optional `TOGETHER_API_KEY`, etc.).

## How to try

Web search (503 without a key — that is correct):

```bash
curl http://localhost:3001/v1/plugins/web-search \
  -H "Authorization: Bearer $OPENDOOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"OpenDoor LLM gateway","max_results":3}'
```

Responses:

```bash
curl http://localhost:3001/v1/responses \
  -H "Authorization: Bearer $OPENDOOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.1-8b-instruct","input":"Say hello in one word"}'
```

Files:

```bash
echo "hello" > /tmp/opendoor-note.txt
curl http://localhost:3001/v1/files \
  -H "Authorization: Bearer $OPENDOOR_API_KEY" \
  -F purpose=assistants \
  -F file=@/tmp/opendoor-note.txt
curl http://localhost:3001/v1/files \
  -H "Authorization: Bearer $OPENDOOR_API_KEY"
```

## Chat helper

`runWebSearch(query)` lives in `apps/gateway/src/lib/web-search.ts` (also re-exported from `routes/plugins.ts`). Import it from chat later; do not fake results if it throws `WebSearchNotConfiguredError`.

## Docs sidebar (optional)

`docs.json` — add under the "Chat & more" group:

```json
{ "title": "Responses", "href": "/api-reference/responses" },
{ "title": "Files", "href": "/api-reference/files" },
{ "title": "Web search", "href": "/api-reference/web-search" }
```

Pages already exist at `docs/api-reference/responses.mdx`, `files.mdx`, `web-search.mdx`.

## Skipped

- **Workflow `web_search` step** — wired. `POST /api/workflows/:id/run` also runs `code_execution` (Cloud Run gVisor jail when `CODE_SANDBOX_URL` is set; local execFile fallback otherwise), `condition`, and `human_review` (pause / approve).
- **`apps/chat` → OpenDoor** — still a Nuxt / Vercel AI Gateway template (`AI_GATEWAY_API_KEY`, `anthropic/…` model IDs). Server already proxies to the dashboard Next API. Pointing it at OpenDoor is a rewrite, not an env swap.
- **`apps/docs` mirrors** — that tree is leftover Docusaurus; README says do not add pages. Canonical docs are repo-root `docs/`.
- **PDF text extract** — `pdf-parse` is not a gateway dependency. `.txt` / `.md` only; PDF bytes can still be stored.
- **Database file table** — other agent owns schema. Files persist in `tmp/opendoor-files` + `index.json`.
