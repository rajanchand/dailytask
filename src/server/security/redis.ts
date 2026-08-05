import IORedis from "ioredis";

let redis: IORedis | null = null;
let connecting: Promise<void> | null = null;

export function getRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) {
    redis = new IORedis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 2000,
      retryStrategy(times) {
        if (times > 2) return null;
        return Math.min(times * 150, 500);
      },
    });
    redis.on("error", (err) => {
      // Avoid noisy stack spam; rate-limit / workers soft-fail open when Redis is down.
      console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "redis.error", error: err.message }));
    });
  }
  return redis;
}

export async function ensureRedisConnected(client: IORedis) {
  if (client.status === "ready") return;

  if (client.status === "wait") {
    if (!connecting) {
      connecting = client
        .connect()
        .then(() => undefined)
        .catch((err) => {
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

export async function pingRedis(): Promise<{
  ok: boolean;
  latencyMs: number | null;
  error?: string;
}> {
  const client = getRedisClient();
  if (!client) {
    return { ok: false, latencyMs: null, error: "REDIS_URL not configured" };
  }

  try {
    await ensureRedisConnected(client);
    if (client.status !== "ready") {
      return { ok: false, latencyMs: null, error: "Redis not ready" };
    }
    const start = Date.now();
    const pong = await client.ping();
    return {
      ok: pong === "PONG",
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: null,
      error: err instanceof Error ? err.message : "Redis ping failed",
    };
  }
}
