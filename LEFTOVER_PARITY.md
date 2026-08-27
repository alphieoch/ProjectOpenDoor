# Leftover parity

## Shipped

- Python SDK at `packages/python-sdk/` (not on PyPI).
- Cerebras + Perplexity adapters, registered from `providers/index.ts` via `registerExtraProviders`.
- Public rankings at `/rankings`.
- Gateway routes for generation, images, audio, plugins, responses, files.

## Still later

- Publish the Python SDK to PyPI.
- Full files table in Postgres (GCS / local index is live).
- Bedrock thin adapter (Vertex is the wholesale path).
