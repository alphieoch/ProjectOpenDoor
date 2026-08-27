FROM oven/bun:1.3-alpine

WORKDIR /app
COPY package.json ./
RUN bun install
COPY src ./src

ENV PORT=4200
EXPOSE 4200
CMD ["bun", "src/index.ts"]
