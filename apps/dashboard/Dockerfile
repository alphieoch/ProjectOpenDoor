FROM oven/bun:1-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps/dashboard/package.json ./apps/dashboard/package.json
COPY apps/gateway/package.json ./apps/gateway/package.json
COPY apps/chat/package.json ./apps/chat/package.json
COPY apps/sandbox/package.json ./apps/sandbox/package.json
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
ARG NEXT_PUBLIC_APP_URL=http://localhost:3010
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001
ARG NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3010/callback
ARG NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=
ARG NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID=
ARG NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID=
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
ENV NEXT_PUBLIC_WORKOS_REDIRECT_URI=$NEXT_PUBLIC_WORKOS_REDIRECT_URI
ENV NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=$NEXT_PUBLIC_STRIPE_PRO_PRICE_ID
ENV NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID=$NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID
ENV NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID=$NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY . .
RUN cd packages/database && bun run build
RUN bunx turbo run build --filter=@opendoor/dashboard...

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/docs.json ./docs.json

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["bun", "apps/dashboard/server.js"]
