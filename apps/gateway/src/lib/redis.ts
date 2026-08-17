import Redis from "ioredis";

/**
 * Shared Redis client. Memorystore is optional locally — a private GCP
 * REDIS_URL must not block chat. Fail fast and let callers fall back.
 */
export function createRedis() {
  const url = (process.env.REDIS_URL || "redis://127.0.0.1:6379").trim();
  const client = new (Redis as any)(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1500,
    commandTimeout: 1500,
    lazyConnect: true,
  });
  client.on("error", () => undefined);
  void client.connect().catch(() => undefined);
  return client as Redis;
}
