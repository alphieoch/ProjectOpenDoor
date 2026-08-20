FROM oven/bun:1-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps/gateway ./apps/gateway
COPY apps/dashboard/package.json ./apps/dashboard/package.json
COPY apps/chat/package.json ./apps/chat/package.json
COPY apps/sandbox/package.json ./apps/sandbox/package.json
COPY apps/openbot-bot/package.json ./apps/openbot-bot/package.json
COPY apps/openbot-computer/package.json ./apps/openbot-computer/package.json
COPY apps/openbot-supervisor/package.json ./apps/openbot-supervisor/package.json
COPY scripts/server-only-stub ./scripts/server-only-stub
RUN bun install --frozen-lockfile
# Build workspace packages the gateway imports at runtime
RUN cd packages/shared && bun run build \
 && cd ../database && bun run build \
 && cd ../analytics && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app /app
WORKDIR /app/apps/gateway
EXPOSE 3001
ENV PORT=3001
ENV GATEWAY_PORT=3001
CMD ["bun", "run", "src/index.ts"]
