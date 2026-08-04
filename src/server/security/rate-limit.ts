import IORedis from "ioredis";
import { headers } from "next/headers";

let redis: IORedis | null = null;
let connecting: Promise<void> | null = null;

function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) {
    redis = new IORedis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 2000,
      // Soft-fail: don't keep reconnecting forever in serverless-ish contexts
      retryStrategy(times) {
        if (times > 2) return null;
        return Math.min(times * 150, 500);
      },
    });
    redis.on("error", (err) => {
      // Avoid unhandled 'error' crashing the process when Redis flakes
      console.warn("[rate-limit] Redis:", err.message);
    });
  }
  return redis;
}

async function ensureConnected(client: IORedis) {
  if (client.status === "ready") return;

  if (client.status === "wait") {
    if (!connecting) {
      connecting = client
        .connect()
        .then(() => undefined)
        .catch((err) => {
          // "already connecting/connected" is benign with concurrent callers
          if (!String(err?.message ?? err).includes("already")) {
            throw err;
          }
        })
        .finally(() => {
          connecting = null;
        });
    }
    await connecting;
    return;
  }

  // connecting | connect | reconnecting — wait for ready briefly
  if (
    client.status === "connecting" ||
    client.status === "connect" ||
    client.status === "reconnecting"
  ) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Redis connect timeout"));
      }, 2000);
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onEnd = () => {
        cleanup();
        reject(new Error("Redis connection ended"));
      };
      const cleanup = () => {
        clearTimeout(timer);
        client.off("ready", onReady);
        client.off("end", onEnd);
      };
      client.once("ready", onReady);
      client.once("end", onEnd);
      if (client.status === "ready") {
        cleanup();
        resolve();
      }
    });
  }
}

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
  const client = getRedis();
  if (!client) {
    console.warn("[rate-limit] REDIS_URL missing — skipping limit for", key);
    return { ok: true, remaining: limit };
  }

  try {
    await ensureConnected(client);
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
