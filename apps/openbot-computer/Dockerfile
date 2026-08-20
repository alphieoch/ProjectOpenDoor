# Playwright + Chromium pin must match package.json (CopilotKit/openbot, MIT).
FROM mcr.microsoft.com/playwright:v1.62.1-noble

RUN apt-get update && apt-get install -y --no-install-recommends unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app
COPY package.json ./
RUN bun install

COPY src ./src

RUN mkdir -p /workspace
ENV WORKSPACE_DIR=/workspace
ENV PORT=4100
EXPOSE 4100
HEALTHCHECK --interval=2s --timeout=3s --start-period=2s --retries=30 \
  CMD bun -e "const r = await fetch('http://localhost:4100/health'); process.exit(r.ok ? 0 : 1)"

CMD ["bun", "src/index.ts"]
