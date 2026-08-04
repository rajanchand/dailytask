"use server";

import { desc } from "drizzle-orm";
import { db } from "@/server/db";
import { activityLogs, users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireUserPermission } from "@/server/session";

export async function getActivityLogs(limit = 100) {
  await requireUserPermission("audit.view");
  return db
    .select({
      log: activityLogs,
      userName: users.name,
      userEmail: users.email,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}

export async function getRecentActivity(limit = 10) {
  await requireSession();
  const rows = await db
    .select({
      log: activityLogs,
      userName: users.name,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.log.id,
    action: r.log.action,
    userName: r.userName,
    createdAt: r.log.createdAt,
    title:
      r.log.details && typeof r.log.details === "object" && "title" in r.log.details
        ? String((r.log.details as { title?: string }).title ?? "")
        : "",
  }));
}
