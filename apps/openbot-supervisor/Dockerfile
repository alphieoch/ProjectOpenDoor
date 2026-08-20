# The only process that holds the Docker socket. Four Bot-level verbs, no passthrough.
# Vendored from CopilotKit/openbot supervisor (MIT). SPIRE is optional and not required here.
FROM oven/bun:1.3.14-alpine

WORKDIR /app
COPY package.json ./
RUN bun install

COPY src ./src

EXPOSE 4300
CMD ["bun", "src/index.ts"]
