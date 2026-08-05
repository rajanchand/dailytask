import { headers } from "next/headers";
import { ensureRedisConnected, getRedisClient } from "@/server/security/redis";

export async function getClientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return h.get("x-real-ip") || "unknown";
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec?: number;
};

/**
 * Sliding fixed-window counter in Redis.
 * Soft-fails open if Redis is unavailable (logs warning) so the app stays up.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const client = getRedisClient();
  if (!client) {
    console.warn("[rate-limit] REDIS_URL missing — skipping limit for", key);
    return { ok: true, remaining: limit };
  }

  try {
    await ensureRedisConnected(client);
    if (client.status !== "ready") {
      console.warn("[rate-limit] Redis not ready — allowing request for", key);
      return { ok: true, remaining: limit };
    }

    const redisKey = `rl:${key}`;
    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.expire(redisKey, windowSec);
    }
    const ttl = await client.ttl(redisKey);
    if (count > limit) {
      return {
        ok: false,
        remaining: 0,
        retryAfterSec: ttl > 0 ? ttl : windowSec,
      };
    }
    return { ok: true, remaining: Math.max(0, limit - count) };
  } catch (err) {
    console.warn("[rate-limit] Redis error — allowing request", err);
    return { ok: true, remaining: limit };
  }
}

export async function rateLimitAction(
  action: string,
  limit: number,
  windowSec: number,
  extra?: string,
) {
  const ip = await getClientIp();
  const key = extra ? `${action}:${ip}:${extra}` : `${action}:${ip}`;
  return rateLimit(key, limit, windowSec);
}
