import { and, eq, gte, lte } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { db } from "@/server/db";
import { tasks, users } from "@/server/db/schema";
import { todayISO } from "@/lib/utils";

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

function shortStatus(status: string) {
  if (status === "completed") return "done";
  if (status === "in_progress" || status === "working_on_it") return "active";
  if (status === "blocked") return "blocked";
  if (status === "review") return "review";
  if (status === "waiting") return "waiting";
  return "todo";
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
    displayDate: format(new Date(), "d MMM yyyy"),
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
    "Commands",
    "`today task` · list",
    "`today total task update` · counts",
    "`today complete task` · done",
    "`today pending` · remaining",
    "`report` · daily",
    "`weekly report` · week",
    "`help`",
  ].join("\n");
}

export async function buildTodayTasksMessage() {
  const { displayDate, rows } = await loadTodayTasks();
  if (rows.length === 0) {
    return `Today · ${displayDate}\nNo tasks.`;
  }

  const lines = rows.map((t, i) => {
    const meta = [
      shortStatus(t.status),
      t.dueTime ? t.dueTime : null,
      `${t.progress ?? 0}%`,
      t.assigneeName || null,
    ]
      .filter(Boolean)
      .join(" · ");
    return `${i + 1}. ${t.title}  (${meta})`;
  });

  return [`Today · ${displayDate} · ${rows.length} tasks`, ...lines].join("\n");
}

export async function buildTodayStatsMessage() {
  const { displayDate, rows } = await loadTodayTasks();
  const s = summarize(rows);

  return [
    `Today · ${displayDate}`,
    `total ${s.total}  ·  done ${s.completed}  ·  active ${s.inProgress}  ·  pending ${s.pending}  ·  overdue ${s.overdue}`,
    `progress ${s.rate}%`,
  ].join("\n");
}

export async function buildTodayCompletedMessage() {
  const { displayDate, rows } = await loadTodayTasks();
  const completed = rows.filter((t) => t.status === "completed");

  if (completed.length === 0) {
    return `Done today · ${displayDate}\nNone yet.`;
  }

  const lines = completed.map((t, i) => `${i + 1}. ${t.title}`);
  return [`Done today · ${displayDate} · ${completed.length}`, ...lines].join("\n");
}

export async function buildTodayPendingMessage() {
  const { displayDate, rows } = await loadTodayTasks();
  const pending = rows.filter((t) => t.status !== "completed" && t.status !== "cancelled");

  if (pending.length === 0) {
    return `Pending · ${displayDate}\nAll clear.`;
  }

  const lines = pending.map(
    (t, i) => `${i + 1}. ${t.title}  (${shortStatus(t.status)})`,
  );
  return [`Pending · ${displayDate} · ${pending.length}`, ...lines].join("\n");
}

export async function buildDailyReportMessage() {
  const { displayDate, rows } = await loadTodayTasks();
  const s = summarize(rows);
  const remaining = rows.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const completed = rows.filter((t) => t.status === "completed");

  return [
    `Daily report · ${displayDate}`,
    `total ${s.total}  ·  done ${s.completed}  ·  active ${s.inProgress}  ·  pending ${s.pending}  ·  overdue ${s.overdue}  ·  ${s.rate}%`,
    "",
    "Done",
    completed.length
      ? completed
          .slice(0, 8)
          .map((t) => `- ${t.title}`)
          .join("\n")
      : "- none",
    "",
    "Left",
    remaining.length
      ? remaining
          .slice(0, 8)
          .map((t) => `- ${t.title}`)
          .join("\n")
      : "- none",
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
      return `${date}  ${v.completed}/${v.total} (${rate}%)`;
    });

  return [
    `Week · ${start} → ${end}`,
    `total ${s.total}  ·  done ${s.completed}  ·  active ${s.inProgress}  ·  pending ${s.pending}  ·  overdue ${s.overdue}  ·  ${s.rate}%`,
    "",
    ...(dayLines.length ? dayLines : ["No tasks this week"]),
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
