# Tiny Node + Python image for workflow code_execution.
# Cloud Run wraps this in gVisor. No shell, no extra packages.
FROM node:22-alpine
RUN apk add --no-cache python3 \
  && rm -rf /var/cache/apk/*
WORKDIR /app
COPY server.mjs exec.mjs ./
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
