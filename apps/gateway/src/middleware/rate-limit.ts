import type { Context, Next } from "hono";
import Redis from "ioredis";

const redis = new (Redis as any)(process.env.REDIS_URL || "redis://localhost:6379");

export async function rateLimitMiddleware(c: Context, next: Next) {
  const apiKey = c.get("apiKey");

  if (!apiKey) {
    return c.json({ error: "API key required for rate limiting" }, 401);
  }

  const rpm = apiKey.rateLimitRpm || 60;
  const tpm = apiKey.rateLimitTpm || 100000;
  const keyPrefix = apiKey.keyPrefix;

  const minuteKey = `ratelimit:${keyPrefix}:minute`;
  const tokenKey = `ratelimit:${keyPrefix}:tokens`;

  const currentMinute = await redis.incr(minuteKey);
  if (currentMinute === 1) {
    await redis.expire(minuteKey, 60);
  }

  if (currentMinute > rpm) {
    return c.json(
      { error: "Rate limit exceeded: too many requests per minute" },
      429
    );
  }

  const currentTokens = await redis.incrby(tokenKey, 0);
  if (currentTokens > tpm) {
    return c.json(
      { error: "Rate limit exceeded: token quota exceeded" },
      429
    );
  }

  await next();
}

export async function recordTokens(keyPrefix: string, tokens: number) {
  const tokenKey = `ratelimit:${keyPrefix}:tokens`;
  const current = await redis.incrby(tokenKey, tokens);
  if (current === tokens) {
    await redis.expire(tokenKey, 60);
  }
}
