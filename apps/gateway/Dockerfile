FROM oven/bun:1-alpine AS base
RUN apk add --no-cache libc6-compat npm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/gateway/package.json ./apps/gateway/package.json
RUN npm install -g pnpm@9.0.0 && pnpm install --frozen-lockfile

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/gateway ./apps/gateway

WORKDIR /app/apps/gateway
EXPOSE 3001
ENV PORT=3001
CMD ["bun", "src/index.ts"]
