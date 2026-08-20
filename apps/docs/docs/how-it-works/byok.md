# Bring your own keys

Dashboard → Settings → Provider keys (`/dashboard/settings/byok`) or API Keys (`/dashboard/api-keys`).

- `GET /api/byok` → `{ keys: [{ id, providerSlug, label, keyPrefix, alwaysUse, createdAt, lastUsedAt }] }`
- `POST /api/byok` → `{ providerSlug, apiKey, label?, alwaysUse? }` (rotates the active row for that slug)
- `DELETE /api/byok/:id`

Raw secrets are never returned. Stored in `organization_provider_keys`. Same table the gateway decrypts.

Canonical page: `docs/how-it-works/byok.mdx`.
