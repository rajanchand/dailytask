"use server";

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { subDays, format } from "date-fns";
import { db } from "@/server/db";
import { tasks } from "@/server/db/schema";
import { todayISO } from "@/lib/utils";
import { requireUserPermission } from "@/server/session";

export async function getAnalyticsData(days = 14) {
  await requireUserPermission("analytics.view");
  const today = todayISO();
  const from = format(subDays(new Date(), days - 1), "yyyy-MM-dd");

  const allTasks = await db
    .select()
    .from(tasks)
    .where(and(gte(tasks.date, from), lte(tasks.date, today)));

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byDate: Record<string, { total: number; completed: number }> = {};

  for (const task of allTasks) {
    byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;
    if (!byDate[task.date]) byDate[task.date] = { total: 0, completed: 0 };
    byDate[task.date].total++;
    if (task.status === "completed") byDate[task.date].completed++;
  }

  const dailyTrend = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => ({
      date,
      total: stats.total,
      completed: stats.completed,
      rate: stats.total ? Math.round((stats.completed / stats.total) * 100) : 0,
    }));

  const statusChart = Object.entries(byStatus).map(([status, count]) => ({
    status,
    count,
  }));

  const priorityChart = Object.entries(byPriority).map(([priority, count]) => ({
    priority,
    count,
  }));

  const [overdueCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.isOverdue, true));

  return {
    totalTasks: allTasks.length,
    completedTasks: allTasks.filter((t) => t.status === "completed").length,
    overdueTasks: Number(overdueCount?.count ?? 0),
    dailyTrend,
    statusChart,
    priorityChart,
  };
}
