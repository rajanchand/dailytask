import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { APP_NAME } from "@/lib/brand";
import { db } from "@/server/db";
import { pingRedis } from "@/server/security/redis";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Soft warning threshold for upload dir size (MB). Override with HEALTH_UPLOADS_WARN_MB. */
const UPLOADS_WARN_MB = Number(process.env.HEALTH_UPLOADS_WARN_MB || 2048);

async function dirSizeBytes(root: string): Promise<number | null> {
  try {
    let total = 0;
    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) {
          const st = await fs.stat(full);
          total += st.size;
        }
      }
    }
    await walk(root);
    return total;
  } catch {
    return null;
  }
}

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

  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  const uploadsBytes = await dirSizeBytes(uploadDir);
  const uploadsMb =
    uploadsBytes == null ? null : Math.round(uploadsBytes / 1024 / 1024);
  const uploads = {
    pathConfigured: Boolean(process.env.UPLOAD_DIR),
    sizeMb: uploadsMb,
    warn: uploadsMb != null && uploadsMb >= UPLOADS_WARN_MB,
    thresholdMb: UPLOADS_WARN_MB,
  };
  if (uploads.warn) {
    logger.warn("health.uploads_large", {
      sizeMb: uploadsMb,
      thresholdMb: UPLOADS_WARN_MB,
    });
  }

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
        uploads,
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
