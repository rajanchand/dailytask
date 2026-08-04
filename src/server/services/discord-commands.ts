import { and, eq, gte, lte } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { db } from "@/server/db";
import { tasks, users } from "@/server/db/schema";
import { STATUS_LABELS, PRIORITY_LABELS, todayISO } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

export type DiscordCommand =
  | "today_tasks"
  | "today_stats"
  | "today_completed"
  | "today_pending"
  | "daily_report"
  | "weekly_report"
  | "help"
  | null;

/** Match natural phrases users type in Discord */
export function parseDiscordCommand(raw: string): DiscordCommand {
  const text = raw.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;

  if (
    text === "help" ||
    text.includes("bot help") ||
    text === "commands" ||
    text.includes("dailytask help") ||
    text.includes("dailyflow help")
  ) {
    return "help";
  }

  // weekly report first (before generic report)
  if (
    text.includes("weekly report") ||
    text === "week report" ||
    text === "report week" ||
    (text.includes("week") && text.includes("report"))
  ) {
    return "weekly_report";
  }

  // daily / full report
  if (
    text === "report" ||
    text === "daily report" ||
    text === "today report" ||
    text.includes("full report") ||
    text.includes("task report") ||
    (text.includes("report") && text.includes("today"))
  ) {
    return "daily_report";
  }

  if (
    (text.includes("today") && text.includes("complete")) ||
    text.includes("completed task") ||
    text.includes("done today") ||
    text === "today complete task" ||
    text === "today completed"
  ) {
    return "today_completed";
  }

  if (
    (text.includes("today") && (text.includes("pending") || text.includes("remaining"))) ||
    text.includes("open task")
  ) {
    return "today_pending";
  }

  if (
    (text.includes("today") &&
      (text.includes("total") ||
        text.includes("update") ||
        text.includes("summary") ||
        text.includes("stat") ||
        text.includes("progress") ||
        text.includes("overview"))) ||
    text === "today total task update" ||
    text === "daily summary"
  ) {
    return "today_stats";
  }

  if (
    text.includes("today task") ||
    text.includes("todays task") ||
    text.includes("today's task") ||
    text === "today tasks" ||
    text === "my tasks today" ||
    text === "task list today" ||
    (text.includes("today") && text.includes("list"))
  ) {
    return "today_tasks";
  }

  return null;
}

function statusIcon(status: string) {
  if (status === "completed") return "✅";
  if (status === "in_progress" || status === "working_on_it") return "🔄";
  if (status === "blocked") return "🚫";
  if (status === "review") return "👀";
  if (status === "waiting") return "⏳";
  return "⬜";
}

function priorityIcon(priority: string) {
  if (priority === "critical") return "🔴";
  if (priority === "high") return "🟥";
  if (priority === "medium") return "🟡";
  if (priority === "low") return "🟢";
  return "⚪";
}

async function loadTasksForDate(date: string) {
  const rows = await db
    .select({
      task: tasks,
      assigneeName: users.name,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.date, date));

  return rows.map((r) => ({
    ...r.task,
    assigneeName: r.assigneeName,
  }));
}

async function loadTodayTasks() {
  const date = todayISO();
  return {
    date,
    displayDate: format(new Date(), "EEEE, d MMMM yyyy"),
    rows: await loadTasksForDate(date),
  };
}

function summarize(rows: Awaited<ReturnType<typeof loadTasksForDate>>) {
  const total = rows.length;
  const completed = rows.filter((t) => t.status === "completed").length;
  const inProgress = rows.filter((t) =>
    ["in_progress", "working_on_it", "review"].includes(t.status),
  ).length;
  const pending = rows.filter((t) =>
    ["not_started", "waiting", "blocked"].includes(t.status),
  ).length;
  const overdue = rows.filter((t) => t.isOverdue && t.status !== "completed").length;
  const rate = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, inProgress, pending, overdue, rate };
}

export function formatHelpMessage() {
  return [
    `🤖 **${APP_NAME} — Discord Commands**`,
    "",
    "Type any of these:",
    "",
    "• `today task` — today's task list",
    "• `today total task update` — totals / progress",
    "• `today complete task` — completed today",
    "• `today pending` — remaining tasks",
    "• `report` or `daily report` — full daily report",
    "• `weekly report` — last 7 days report",
    "• `help` — this menu",
  ].join("\n");
}

export async function buildTodayTasksMessage() {
  const { displayDate, rows } = await loadTodayTasks();
  if (rows.length === 0) {
    return `📋 **Today's Tasks**\n📅 ${displayDate}\n\nNo tasks scheduled for today.`;
  }

  const lines = rows.map((t, i) => {
    const time = t.dueTime ? ` · due ${t.dueTime}` : "";
    const who = t.assigneeName ? ` · ${t.assigneeName}` : "";
    return `${i + 1}. ${statusIcon(t.status)} **${t.title}**${time}${who}\n    ${priorityIcon(t.priority)} ${PRIORITY_LABELS[t.priority] ?? t.priority} · ${STATUS_LABELS[t.status] ?? t.status} · ${t.progress ?? 0}%`;
  });

  return [`📋 **Today's Tasks**`, `📅 ${displayDate}`, `Total: **${rows.length}**`, "", ...lines].join(
    "\n",
  );
}

export async function buildTodayStatsMessage() {
  const { displayDate, rows } = await loadTodayTasks();
  const s = summarize(rows);

  return [
    "📊 **Today Total Task Update**",
    `📅 ${displayDate}`,
    "",
    `📋 Total: **${s.total}**`,
    `✅ Completed: **${s.completed}**`,
    `🔄 In Progress: **${s.inProgress}**`,
    `⚠️ Pending: **${s.pending}**`,
    `🔴 Overdue: **${s.overdue}**`,
    "",
    `Productivity: **${s.rate}%**`,
    s.rate > 0
      ? `\`${"█".repeat(Math.round(s.rate / 10))}${"░".repeat(10 - Math.round(s.rate / 10))}\` ${s.rate}%`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function buildTodayCompletedMessage() {
  const { displayDate, rows } = await loadTodayTasks();
  const completed = rows.filter((t) => t.status === "completed");

  if (completed.length === 0) {
    return `✅ **Today Completed Tasks**\n📅 ${displayDate}\n\nNo tasks completed yet today.`;
  }

  const lines = completed.map((t, i) => {
    const who = t.assigneeName ? ` · ${t.assigneeName}` : "";
    return `${i + 1}. ✅ **${t.title}**${who}`;
  });

  return [
    "✅ **Today Completed Tasks**",
    `📅 ${displayDate}`,
    `Completed: **${completed.length}**`,
    "",
    ...lines,
  ].join("\n");
}

export async function buildTodayPendingMessage() {
  const { displayDate, rows } = await loadTodayTasks();
  const pending = rows.filter((t) => t.status !== "completed" && t.status !== "cancelled");

  if (pending.length === 0) {
    return `🎉 **Today Pending Tasks**\n📅 ${displayDate}\n\nAll clear — nothing pending.`;
  }

  const lines = pending.map((t, i) => {
    const who = t.assigneeName ? ` · ${t.assigneeName}` : "";
    return `${i + 1}. ${statusIcon(t.status)} **${t.title}** (${STATUS_LABELS[t.status] ?? t.status})${who}`;
  });

  return [
    "⚠️ **Today Pending Tasks**",
    `📅 ${displayDate}`,
    `Remaining: **${pending.length}**`,
    "",
    ...lines,
  ].join("\n");
}

export async function buildDailyReportMessage() {
  const { displayDate, rows } = await loadTodayTasks();
  const s = summarize(rows);
  const remaining = rows.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const completed = rows.filter((t) => t.status === "completed");

  return [
    `📑 **${APP_NAME} — Daily Report**`,
    `📅 ${displayDate}`,
    "",
    "━━━ Overview ━━━",
    `📋 Total: **${s.total}**`,
    `✅ Completed: **${s.completed}**`,
    `🔄 In Progress: **${s.inProgress}**`,
    `⚠️ Pending: **${s.pending}**`,
    `🔴 Overdue: **${s.overdue}**`,
    `📈 Completion: **${s.rate}%**`,
    "",
    "━━━ Completed ━━━",
    completed.length
      ? completed
          .slice(0, 8)
          .map((t) => `✅ ${t.title}`)
          .join("\n")
      : "None yet",
    "",
    "━━━ Remaining ━━━",
    remaining.length
      ? remaining
          .slice(0, 8)
          .map((t) => `${statusIcon(t.status)} ${t.title}`)
          .join("\n")
      : "None — all done 🎉",
  ].join("\n");
}

export async function buildWeeklyReportMessage() {
  const end = todayISO();
  const start = format(subDays(new Date(), 6), "yyyy-MM-dd");
  const rows = await db
    .select({
      task: tasks,
      assigneeName: users.name,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(gte(tasks.date, start), lte(tasks.date, end)));

  const list = rows.map((r) => ({ ...r.task, assigneeName: r.assigneeName }));
  const s = summarize(list);

  const byDay: Record<string, { total: number; completed: number }> = {};
  for (const t of list) {
    if (!byDay[t.date]) byDay[t.date] = { total: 0, completed: 0 };
    byDay[t.date].total++;
    if (t.status === "completed") byDay[t.date].completed++;
  }

  const dayLines = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => {
      const rate = v.total ? Math.round((v.completed / v.total) * 100) : 0;
      return `• ${date}: ${v.completed}/${v.total} done (${rate}%)`;
    });

  return [
    `📆 **${APP_NAME} — Weekly Report**`,
    `📅 ${start} → ${end}`,
    "",
    `📋 Total tasks: **${s.total}**`,
    `✅ Completed: **${s.completed}**`,
    `🔄 In Progress: **${s.inProgress}**`,
    `⚠️ Pending: **${s.pending}**`,
    `🔴 Overdue: **${s.overdue}**`,
    `📈 Completion rate: **${s.rate}%**`,
    "",
    "━━━ By day ━━━",
    dayLines.length ? dayLines.join("\n") : "No tasks this week",
  ].join("\n");
}

export async function runDiscordCommand(command: DiscordCommand): Promise<string | null> {
  if (!command) return null;
  switch (command) {
    case "help":
      return formatHelpMessage();
    case "today_tasks":
      return buildTodayTasksMessage();
    case "today_stats":
      return buildTodayStatsMessage();
    case "today_completed":
      return buildTodayCompletedMessage();
    case "today_pending":
      return buildTodayPendingMessage();
    case "daily_report":
      return buildDailyReportMessage();
    case "weekly_report":
      return buildWeeklyReportMessage();
    default:
      return null;
  }
}

export type ReportKind = "daily" | "weekly" | "today_tasks" | "today_stats" | "today_completed";

export async function buildReportByKind(kind: ReportKind) {
  switch (kind) {
    case "daily":
      return buildDailyReportMessage();
    case "weekly":
      return buildWeeklyReportMessage();
    case "today_tasks":
      return buildTodayTasksMessage();
    case "today_stats":
      return buildTodayStatsMessage();
    case "today_completed":
      return buildTodayCompletedMessage();
  }
}
