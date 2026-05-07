FROM oven/bun:1-alpine AS base
RUN apk add --no-cache libc6-compat npm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/docs/package.json ./apps/docs/package.json
RUN npm install -g pnpm@9.0.0 && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps/docs/node_modules ./apps/docs/node_modules
COPY . .
RUN npm install -g pnpm@9.0.0 && pnpm turbo run build --filter=@opendoor/docs...

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g serve
COPY --from=builder /app/apps/docs/build ./build
EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]
