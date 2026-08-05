"use server";

import { freemem, hostname, loadavg, totalmem, uptime } from "os";
import { readFile } from "fs/promises";
import { sql, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  activityLogs,
  notifications,
  projects,
  tasks,
  teams,
  users,
  userSessions,
} from "@/server/db/schema";
import { requireSuperAdmin } from "@/server/session";
import { requireSystemHealthGate } from "@/server/system-health-gate";
import { pingRedis } from "@/server/security/redis";
import { APP_NAME } from "@/lib/brand";

const APP_VERSION = process.env.npm_package_version ?? "0.1.0";

const querySchema = z
  .object({
    activityLimit: z.coerce.number().int().min(1).max(50).optional(),
    usersLimit: z.coerce.number().int().min(1).max(200).optional(),
    sessionsLimit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

async function readProcMem() {
  try {
    const raw = await readFile("/proc/meminfo", "utf8");
    const totalMatch = raw.match(/^MemTotal:\s+(\d+)\s+kB/m);
    const availMatch = raw.match(/^MemAvailable:\s+(\d+)\s+kB/m);
    if (!totalMatch || !availMatch) return null;
    const totalKb = Number(totalMatch[1]);
    const availKb = Number(availMatch[1]);
    return {
      source: "proc" as const,
      totalBytes: totalKb * 1024,
      availableBytes: availKb * 1024,
      usedBytes: (totalKb - availKb) * 1024,
    };
  } catch {
    return null;
  }
}

async function readDiskUsage() {
  try {
    // Node 18.15+ — works inside containers for the mount of process.cwd()
    const { statfs } = await import("fs/promises");
    const stats = await statfs(process.cwd());
    const total = Number(stats.bsize) * Number(stats.blocks);
    const free = Number(stats.bsize) * Number(stats.bavail);
    return {
      source: "statfs" as const,
      path: process.cwd(),
      totalBytes: total,
      freeBytes: free,
      usedBytes: total - free,
    };
  } catch {
    return null;
  }
}

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export async function getSystemHealthAction(input?: unknown) {
  await requireSuperAdmin();
  await requireSystemHealthGate();

  const parsed = querySchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { error: "Invalid request parameters" as const };
  }

  const activityLimit = parsed.data.activityLimit ?? 25;
  const usersLimit = parsed.data.usersLimit ?? 100;
  const sessionsLimit = parsed.data.sessionsLimit ?? 100;

  const collectedAt = new Date().toISOString();
  let database: {
    ok: boolean;
    latencyMs: number | null;
    error?: string;
    counts: {
      users: number;
      teams: number;
      tasks: number;
      projects: number;
      notifications: number;
      sessions: number;
    };
  };

  try {
    const start = Date.now();
    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [teamCount] = await db.select({ count: sql<number>`count(*)::int` }).from(teams);
    const [taskCount] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks);
    const [projectCount] = await db.select({ count: sql<number>`count(*)::int` }).from(projects);
    const [notificationCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications);
    const [sessionCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userSessions);

    database = {
      ok: true,
      latencyMs: Date.now() - start,
      counts: {
        users: Number(userCount?.count ?? 0),
        teams: Number(teamCount?.count ?? 0),
        tasks: Number(taskCount?.count ?? 0),
        projects: Number(projectCount?.count ?? 0),
        notifications: Number(notificationCount?.count ?? 0),
        sessions: Number(sessionCount?.count ?? 0),
      },
    };
  } catch (err) {
    console.error("[system-health] database check failed", err);
    database = {
      ok: false,
      latencyMs: null,
      error: "Database unreachable",
      counts: {
        users: 0,
        teams: 0,
        tasks: 0,
        projects: 0,
        notifications: 0,
        sessions: 0,
      },
    };
  }

  const redis = await pingRedis();

  const procMem = await readProcMem();
  const memory = procMem ?? {
    source: "os" as const,
    totalBytes: totalmem(),
    availableBytes: freemem(),
    usedBytes: totalmem() - freemem(),
  };

  const disk = await readDiskUsage();

  const host = {
    hostname: hostname(),
    uptimeSec: Math.floor(uptime()),
    loadAvg: loadavg().map((n) => Number(n.toFixed(2))),
    memory: {
      ...memory,
      total: formatBytes(memory.totalBytes),
      available: formatBytes(memory.availableBytes),
      used: formatBytes(memory.usedBytes),
    },
    disk: disk
      ? {
          path: disk.path,
          total: formatBytes(disk.totalBytes),
          free: formatBytes(disk.freeBytes),
          used: formatBytes(disk.usedBytes),
          totalBytes: disk.totalBytes,
          freeBytes: disk.freeBytes,
          usedBytes: disk.usedBytes,
        }
      : null,
    nodeVersion: process.version,
    platform: process.platform,
  };

  const userRows = database.ok
    ? await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          disabled: users.disabled,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(usersLimit)
    : [];

  const activity = database.ok
    ? await db
        .select({
          id: activityLogs.id,
          action: activityLogs.action,
          entityType: activityLogs.entityType,
          entityId: activityLogs.entityId,
          details: activityLogs.details,
          createdAt: activityLogs.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(activityLogs)
        .leftJoin(users, eq(activityLogs.userId, users.id))
        .orderBy(desc(activityLogs.createdAt))
        .limit(activityLimit)
    : [];

  const sessions = database.ok
    ? await db
        .select({
          id: userSessions.id,
          userId: userSessions.userId,
          userName: users.name,
          userEmail: users.email,
          ipAddress: userSessions.ipAddress,
          userAgent: userSessions.userAgent,
          browser: userSessions.browser,
          os: userSessions.os,
          device: userSessions.device,
          country: userSessions.country,
          isp: userSessions.isp,
          status: userSessions.status,
          loginAt: userSessions.loginAt,
          lastSeenAt: userSessions.lastSeenAt,
          logoutAt: userSessions.logoutAt,
        })
        .from(userSessions)
        .leftJoin(users, eq(userSessions.userId, users.id))
        .orderBy(desc(userSessions.loginAt))
        .limit(sessionsLimit)
    : [];

  const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || process.env.APP_URL || null;

  return {
    ok: true as const,
    collectedAt,
    app: {
      status: database.ok ? ("ok" as const) : ("degraded" as const),
      name: APP_NAME,
      version: APP_VERSION,
      authUrl,
      timestamp: collectedAt,
    },
    database,
    redis: {
      ok: redis.ok,
      latencyMs: redis.latencyMs,
      // Never expose REDIS_URL or connection strings
      message: redis.ok ? "PONG" : "unavailable",
    },
    host,
    users: userRows,
    sessions,
    activity,
  };
}

export type SystemHealth = Exclude<Awaited<ReturnType<typeof getSystemHealthAction>>, { error: string }>;
