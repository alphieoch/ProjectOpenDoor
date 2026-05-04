---
sidebar_position: 3
---

# Local Development

## Start All Services

```bash
# Terminal 1: Gateway
pnpm gateway:dev

# Terminal 2: Dashboard
pnpm dashboard:dev

# Terminal 3: Docs (optional)
cd apps/docs && pnpm start --port 3002
```

Or use Turbo to run everything:

```bash
pnpm dev
```

## Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Dashboard | http://localhost:3000 | Admin UI |
| Gateway | http://localhost:3001 | API endpoint |
| Gateway Health | http://localhost:3001/health | Load-balancer / probe (minimal JSON) |
| Gateway Status | http://localhost:3001/status | Postgres, Redis, provider env flags, and **Azure OpenAI deployment list** when `AZURE_AI_FOUNDRY_*` is set (dashboard at http://localhost:3000/status) |
| Docs | http://localhost:3002 | Documentation |

## Default Login

- **Email**: `admin@ocheingco.com`
- **Password**: `admin123!`

## Test the API

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 50
  }'
```

## Test with Streaming

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

## List Available Models

```bash
curl http://localhost:3001/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Database Studio

```bash
pnpm db:studio
```

Opens Drizzle Studio for browsing the database.

## Common Issues

### Port Conflicts

If ports 3000, 3001, or 3002 are in use:

```bash
# Find and kill processes on those ports
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
lsof -ti:3002 | xargs kill -9
```

### Database Connection Issues

Ensure PostgreSQL is running:

```bash
docker ps | grep postgres
```

### Missing Environment Variables

Check `.env` file exists and has all required variables:

```bash
cat .env | grep -v "^#" | grep -v "^$"
```
