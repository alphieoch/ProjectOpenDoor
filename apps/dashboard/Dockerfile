FROM node:20-alpine AS base
RUN apk add --no-cache curl libc6-compat
# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/dashboard/package.json ./apps/dashboard/package.json
RUN npm install -g pnpm@9.0.0 && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY . .
RUN npm install -g pnpm@9.0.0 && pnpm --filter @opendoor/dashboard build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public
COPY --from=builder /app/packages ./packages

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["bun", "apps/dashboard/server.js"]
