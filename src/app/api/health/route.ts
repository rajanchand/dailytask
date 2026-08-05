import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { APP_NAME } from "@/lib/brand";
import { db } from "@/server/db";
import { pingRedis } from "@/server/security/redis";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness + dependency probe for load balancers / ops.
 * - 200 when the process is up and Postgres answers
 * - 503 when Postgres is down (Redis failure alone → degraded but 200 so the app can still serve)
 */
export async function GET() {
  const collectedAt = new Date().toISOString();
  let database: { ok: boolean; latencyMs: number | null; error?: string } = {
    ok: false,
    latencyMs: null,
  };

  try {
    const start = Date.now();
    await db.execute(sql`select 1`);
    database = { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    logger.error("health.database_failed", { err });
    database = {
      ok: false,
      latencyMs: null,
      error: "unreachable",
    };
  }

  const redisPing = await pingRedis();
  const redis = {
    ok: redisPing.ok,
    latencyMs: redisPing.latencyMs,
    // Never expose connection strings or detailed errors to anonymous callers
    configured: Boolean(process.env.REDIS_URL),
  };

  const status = database.ok ? (redis.ok ? "ok" : "degraded") : "unhealthy";
  const httpStatus = database.ok ? 200 : 503;

  return NextResponse.json(
    {
      status,
      app: APP_NAME,
      timestamp: collectedAt,
      checks: {
        database,
        redis,
      },
    },
    {
      status: httpStatus,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
