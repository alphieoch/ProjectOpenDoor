---
sidebar_position: 2
---

# Docker Deployment

## Local Development

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Run migrations
pnpm db:migrate

# Start gateway
pnpm gateway:dev

# Start dashboard
pnpm dashboard:dev
```

## Production Docker

Build images for each service:

```bash
# Gateway
docker build -t opendoor-gateway ./apps/gateway

# Dashboard
docker build -t opendoor-dashboard ./apps/dashboard
```

## Docker Compose (Production)

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: opendoor
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  gateway:
    image: opendoor-gateway
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/opendoor
      REDIS_URL: redis://redis:6379
      AZURE_AI_FOUNDRY_ENDPOINT: ${AZURE_AI_FOUNDRY_ENDPOINT}
      AZURE_AI_FOUNDRY_KEY: ${AZURE_AI_FOUNDRY_KEY}
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis

  dashboard:
    image: opendoor-dashboard
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/opendoor
      NEXT_PUBLIC_GATEWAY_URL: http://gateway:3001
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - gateway

volumes:
  postgres_data:
```

## Azure Container Apps

Deploy to Azure Container Apps for serverless hosting:

```bash
# Create Container Apps environment
az containerapp env create \
  --name opendoor-env \
  --resource-group OchiengandCo \
  --location uksouth

# Deploy gateway
az containerapp create \
  --name opendoor-gateway \
  --resource-group OchiengandCo \
  --environment opendoor-env \
  --image opendoor-gateway \
  --target-port 3001 \
  --ingress external
```
