"use server";

import { and, gte, lte } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { requireSession } from "@/server/session";
import { sendDiscordWebhook } from "@/server/services/discord";
import {
  buildReportByKind,
  type ReportKind,
} from "@/server/services/discord-commands";
import { getDashboardStats } from "@/server/actions/tasks";
import { logActivity } from "@/server/services/activity";
import { db } from "@/server/db";
import { tasks } from "@/server/db/schema";
import { todayISO } from "@/lib/utils";

export async function getReportsOverview() {
  const session = await requireSession();
  const today = await getDashboardStats();

  const end = todayISO();
  const start = format(subDays(new Date(), 6), "yyyy-MM-dd");
  const weekTasks = await db
    .select()
    .from(tasks)
    .where(and(gte(tasks.date, start), lte(tasks.date, end)));

  const weekCompleted = weekTasks.filter((t) => t.status === "completed").length;
  const weekOverdue = weekTasks.filter((t) => t.isOverdue && t.status !== "completed").length;

  return {
    user: session.user,
    today: {
      date: today.date,
      total: today.total,
      completed: today.completed,
      inProgress: today.inProgress,
      pending: today.pending,
      overdue: today.overdue,
      progress: today.progress,
      remainingTitles: today.tasks
        .filter((t) => t.status !== "completed" && t.status !== "cancelled")
        .map((t) => t.title),
      completedTitles: today.tasks
        .filter((t) => t.status === "completed")
        .map((t) => t.title),
    },
    week: {
      totalTasks: weekTasks.length,
      completedTasks: weekCompleted,
      overdueTasks: weekOverdue,
      rate: weekTasks.length ? Math.round((weekCompleted / weekTasks.length) * 100) : 0,
    },
  };
}

export async function sendReportToDiscordAction(kind: ReportKind) {
  const session = await requireSession();

  const { rateLimitAction } = await import("@/server/security/rate-limit");
  const limited = await rateLimitAction("discord_report", 15, 60, session.user.id);
  if (!limited.ok) {
    return { ok: false as const, error: "Too many sends. Try again shortly." };
  }

  const content = await buildReportByKind(kind);
  // Manual Send Report always posts when a webhook exists (do not gate on Daily Summary checkbox).
  const sent = await sendDiscordWebhook(null, "dailySummary", content, {
    ignoreEventFilter: true,
  });
  if (!sent.ok) {
    return { ok: false as const, error: sent.error || "Could not send report" };
  }

  await logActivity({
    userId: session.user.id,
    action: "report.sent_discord",
    entityType: "report",
    details: { kind },
  });

  return { ok: true as const };
}
