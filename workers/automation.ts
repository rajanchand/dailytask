import "dotenv/config";
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { and, eq, lte, ne, isNotNull, or } from "drizzle-orm";
import { format, addDays } from "date-fns";
import { db } from "../src/server/db";
import {
  tasks,
  users,
  dailySummaries,
  reminders,
  calendarEntries,
  projects,
} from "../src/server/db/schema";
import { createNotification, logActivity } from "../src/server/services/activity";
import { sendDiscordWebhook } from "../src/server/services/discord";
import {
  sendMorningTaskEmail,
  sendPendingTasksEmail,
  type DigestTaskLine,
} from "../src/server/services/mail";
import { newId, todayISO } from "../src/lib/utils";
import { logger } from "../src/server/logger";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const QUEUE_NAME = "dailyflow-automation";
/** Local morning report: 08:30–08:44 (worker ticks every 15 minutes). */
const MORNING_REPORT_LOCAL_HOUR = 8;
const MORNING_REPORT_LOCAL_MINUTE_START = 30;
/** Local EOD Discord/update: 17:00–17:14. */
const EOD_SUMMARY_LOCAL_HOUR = 17;

/** Local wall-clock hour (0–23) in the given IANA timezone. Falls back to UTC on invalid zones. */
function localHourInTimezone(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || "UTC",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  } catch {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  }
}

/** Local wall-clock minute (0–59) in the given IANA timezone. */
function localMinuteInTimezone(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || "UTC",
      minute: "numeric",
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  } catch {
    return date.getUTCMinutes();
  }
}

function isLocalMorningReportWindow(now: Date, timeZone: string) {
  const hour = localHourInTimezone(now, timeZone);
  const minute = localMinuteInTimezone(now, timeZone);
  return (
    hour === MORNING_REPORT_LOCAL_HOUR &&
    minute >= MORNING_REPORT_LOCAL_MINUTE_START &&
    minute < MORNING_REPORT_LOCAL_MINUTE_START + 15
  );
}

function isLocalEodWindow(now: Date, timeZone: string) {
  const hour = localHourInTimezone(now, timeZone);
  const minute = localMinuteInTimezone(now, timeZone);
  return hour === EOD_SUMMARY_LOCAL_HOUR && minute < 15;
}

/** Calendar date YYYY-MM-DD in the user's timezone (en-CA → ISO-like). */
function todayISOInTimezone(timeZone: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return todayISO(date);
  }
}

function wantsEmail(user: typeof users.$inferSelect) {
  return user.notificationPrefs?.emailEnabled !== false;
}

function toDigestLine(task: {
  title: string;
  priority?: string | null;
  status?: string | null;
  dueTime?: string | null;
  projectName?: string | null;
}): DigestTaskLine {
  return {
    title: task.title,
    priority: task.priority,
    status: task.status,
    dueTime: task.dueTime,
    projectName: task.projectName,
  };
}

function formatTaskLine(
  task: { title: string; dueTime?: string | null; projectName?: string | null; daily?: boolean },
  index: number,
) {
  const bits = [
    task.projectName ? `[${task.projectName}]` : null,
    task.dueTime ? `due ${task.dueTime}` : null,
    task.daily ? "🔁" : null,
  ].filter(Boolean);
  return `${index}. ${task.title}${bits.length ? ` (${bits.join(" · ")})` : ""}`;
}

/**
 * Every morning: bring daily / project checklist tasks back for today.
 * Same rows are reused (no duplicates) — date → today, status → not_started.
 */
async function ensureDailyTasksForToday(userId: string, today: string) {
  const dailyTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.assigneeId, userId),
        ne(tasks.status, "cancelled"),
        or(eq(tasks.dailyNotify, true), eq(tasks.recurrence, "daily")),
      ),
    );

  let resetCount = 0;
  for (const task of dailyTasks) {
    // Already fresh for today and not completed — leave progress alone.
    if (task.date === today && task.status !== "completed") {
      if (!task.dailyNotify) {
        await db
          .update(tasks)
          .set({ dailyNotify: true, updatedAt: new Date() })
          .where(eq(tasks.id, task.id));
      }
      continue;
    }

    // Past days, or completed today/earlier → reset so the checklist shows again.
    if (task.date <= today) {
      await db
        .update(tasks)
        .set({
          date: today,
          status: "not_started",
          progress: 0,
          completedAt: null,
          isOverdue: false,
          dueAt: task.dueTime ? new Date(`${today}T${task.dueTime}:00`) : null,
          dailyNotify: true,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id));
      resetCount += 1;
    }
  }

  if (resetCount > 0) {
    logger.info("worker.daily_tasks.reset", { userId, today, resetCount });
  }
}

async function loadUserDayTasks(userId: string, today: string) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueTime: tasks.dueTime,
      isOverdue: tasks.isOverdue,
      dailyNotify: tasks.dailyNotify,
      recurrence: tasks.recurrence,
      projectId: tasks.projectId,
      projectName: projects.name,
      date: tasks.date,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.assigneeId, userId), eq(tasks.date, today)));
}

async function morningReminderJob() {
  logger.info("worker.job.start", { job: "morning-reminder" });
  const now = new Date();
  const allUsers = await db.select().from(users).where(eq(users.disabled, false));

  for (const user of allUsers) {
    if (user.notificationPrefs?.morningReminder === false) continue;

    const tz = user.timezone?.trim() || "UTC";
    if (!isLocalMorningReportWindow(now, tz)) continue;

    const today = todayISOInTimezone(tz, now);
    await ensureDailyTasksForToday(user.id, today);

    const dayTasks = await loadUserDayTasks(user.id, today);
    const open = dayTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
    const completed = dayTasks.filter((t) => t.status === "completed");
    const inProgress = dayTasks.filter((t) =>
      ["in_progress", "working_on_it", "review"].includes(t.status),
    );
    const pending = dayTasks.filter((t) =>
      ["not_started", "waiting", "blocked"].includes(t.status),
    );
    const overdue = dayTasks.filter((t) => t.isOverdue && t.status !== "completed");
    const dailyFlagged = open.filter((t) => t.dailyNotify || t.recurrence === "daily");
    const projectTasks = open.filter((t) => Boolean(t.projectId));

    const openLines = open.length
      ? open
          .slice(0, 25)
          .map((t, i) =>
            formatTaskLine(
              {
                title: t.title,
                dueTime: t.dueTime,
                projectName: t.projectName,
                daily: Boolean(t.dailyNotify || t.recurrence === "daily"),
              },
              i + 1,
            ),
          )
          .join("\n")
      : "None — clear calendar.";
    const more = open.length > 25 ? `\n…and ${open.length - 25} more` : "";

    const reportBody = [
      `Today · ${today}`,
      `All today's tasks are listed in your projects — please complete them on time.`,
      `total ${dayTasks.length}  ·  done ${completed.length}  ·  active ${inProgress.length}  ·  pending ${pending.length}  ·  overdue ${overdue.length}`,
      projectTasks.length ? `in projects ${projectTasks.length}` : null,
      dailyFlagged.length ? `daily checklist ${dailyFlagged.length}` : null,
      "",
      "Your tasks",
      openLines + more,
    ]
      .filter((line) => line !== null)
      .join("\n");

    if (user.notificationPrefs?.inAppEnabled !== false) {
      await createNotification({
        userId: user.id,
        type: "morning_reminder",
        title: "Morning tasks · please complete on time",
        body: `Today's ${open.length} task${open.length !== 1 ? "s" : ""} are listed in your projects. Please complete them on time${
          projectTasks.length ? ` (${projectTasks.length} in projects)` : ""
        }.`,
        link: "/planner",
      });
    }

    await sendDiscordWebhook(
      null,
      "morningReminder",
      `🌅 Morning report · ${user.name}\n${reportBody}`,
    );

    if (wantsEmail(user) && user.email) {
      try {
        const result = await sendMorningTaskEmail({
          to: user.email,
          name: user.name,
          date: today,
          tasks: open.map(toDigestLine),
        });
        if ("skipped" in result && result.skipped) {
          logger.warn("worker.morning.email_skipped", { userId: user.id, reason: result.reason });
        } else {
          logger.info("worker.morning.email_sent", { userId: user.id, count: open.length });
        }
      } catch (err) {
        logger.error("worker.morning.email_failed", { userId: user.id, err });
      }
    }
  }
}

async function tomorrowPreviewJob() {
  logger.info("worker.job.start", { job: "tomorrow-preview" });
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const allUsers = await db.select().from(users).where(eq(users.disabled, false));

  for (const user of allUsers) {
    if (user.notificationPrefs?.tomorrowPreview === false) continue;
    if (user.notificationPrefs?.inAppEnabled === false) continue;

    const dayTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeId, user.id),
          eq(tasks.date, tomorrow),
          ne(tasks.status, "completed"),
          ne(tasks.status, "cancelled"),
        ),
      );

    if (dayTasks.length === 0) continue;

    const titles = dayTasks
      .slice(0, 5)
      .map((t) => `• ${t.title}`)
      .join("\n");
    const more = dayTasks.length > 5 ? `\n…and ${dayTasks.length - 5} more` : "";

    await createNotification({
      userId: user.id,
      type: "tomorrow_preview",
      title: "Tomorrow's tasks",
      body: `You have ${dayTasks.length} task${dayTasks.length !== 1 ? "s" : ""} scheduled for tomorrow.\n${titles}${more}`,
      link: `/planner?date=${tomorrow}`,
    });
  }
}

async function deadlineCheckJob() {
  logger.info("worker.job.start", { job: "deadline-check" });
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 60 * 1000);

  const dueTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        lte(tasks.dueAt, in30),
        ne(tasks.status, "completed"),
        ne(tasks.status, "cancelled"),
      ),
    );

  for (const task of dueTasks) {
    if (!task.assigneeId || !task.dueAt) continue;
    if (task.dueAt.getTime() < now.getTime() - 5 * 60 * 1000) continue;

    const [user] = await db.select().from(users).where(eq(users.id, task.assigneeId)).limit(1);
    if (user?.notificationPrefs?.deadlineReminder === false) continue;

    const mins = Math.max(0, Math.round((task.dueAt.getTime() - now.getTime()) / 60000));
    await createNotification({
      userId: task.assigneeId,
      type: "deadline",
      title: mins <= 0 ? "Deadline now" : "Deadline approaching",
      body:
        mins <= 0
          ? `"${task.title}" is due now.`
          : `⏰ "${task.title}" is due in ${mins} minutes.`,
      link: "/planner",
    });

    await db.insert(reminders).values({
      id: newId(),
      taskId: task.id,
      userId: task.assigneeId,
      remindAt: now,
      type: "deadline",
      sent: true,
    });
  }

  // Personal calendar entry reminders (remind_at due, not yet notified)
  const dueEntries = await db
    .select()
    .from(calendarEntries)
    .where(
      and(
        isNotNull(calendarEntries.remindAt),
        lte(calendarEntries.remindAt, now),
        eq(calendarEntries.reminderSent, false),
      ),
    );

  for (const entry of dueEntries) {
    if (!entry.remindAt) continue;
    const [user] = await db.select().from(users).where(eq(users.id, entry.userId)).limit(1);
    if (user?.notificationPrefs?.inAppEnabled === false) continue;
    if (user?.notificationPrefs?.deadlineReminder === false) continue;

    await createNotification({
      userId: entry.userId,
      type: "calendar_reminder",
      title: "Calendar reminder",
      body: `📅 ${entry.title}${entry.notes ? ` — ${entry.notes.slice(0, 120)}` : ""}`,
      link: "/calendar",
      metadata: { entryId: entry.id, date: entry.date, type: entry.type },
    });

    await db
      .update(calendarEntries)
      .set({ reminderSent: true, updatedAt: new Date() })
      .where(eq(calendarEntries.id, entry.id));
  }
}

async function overdueMarkJob() {
  logger.info("worker.job.start", { job: "overdue-mark" });
  const today = todayISO();

  const overdueTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        lte(tasks.date, today),
        ne(tasks.status, "completed"),
        ne(tasks.status, "cancelled"),
        eq(tasks.isOverdue, false),
      ),
    );

  for (const task of overdueTasks) {
    // Only mark overdue if date is before today, or dueAt passed
    if (task.date === today && (!task.dueAt || task.dueAt > new Date())) continue;

    await db.update(tasks).set({ isOverdue: true, updatedAt: new Date() }).where(eq(tasks.id, task.id));

    if (task.assigneeId) {
      const [user] = await db.select().from(users).where(eq(users.id, task.assigneeId)).limit(1);
      if (user?.notificationPrefs?.overdue !== false) {
        await createNotification({
          userId: task.assigneeId,
          type: "overdue",
          title: "Task overdue",
          body: `🔴 Task "${task.title}" is overdue.`,
          link: "/planner",
        });
      }
    }

    await sendDiscordWebhook(task.teamId, "taskOverdue", `⚠️ **Overdue**\n${task.title}`);
  }

  await logActivity({
    action: "worker.overdue_mark",
    entityType: "system",
    details: { count: overdueTasks.length },
  });
}

async function eodSummaryJob() {
  logger.info("worker.job.start", { job: "eod-summary" });
  const now = new Date();
  const allUsers = await db.select().from(users).where(eq(users.disabled, false));

  for (const user of allUsers) {
    if (user.notificationPrefs?.dailySummary === false) continue;

    const tz = user.timezone?.trim() || "UTC";
    if (!isLocalEodWindow(now, tz)) continue;

    const today = todayISOInTimezone(tz, now);
    const dayTasks = await loadUserDayTasks(user.id, today);

    const completedTasks = dayTasks.filter((t) => t.status === "completed");
    const completed = completedTasks.length;
    const inProgress = dayTasks.filter((t) =>
      ["in_progress", "working_on_it", "review"].includes(t.status),
    ).length;
    const pendingCount = dayTasks.filter((t) =>
      ["not_started", "waiting", "blocked"].includes(t.status),
    ).length;
    const overdue = dayTasks.filter((t) => t.isOverdue).length;
    const remaining = dayTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
    const total = dayTasks.length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    const summaryId = newId();
    const existing = await db
      .select()
      .from(dailySummaries)
      .where(and(eq(dailySummaries.userId, user.id), eq(dailySummaries.date, today)))
      .limit(1);

    const summaryData = {
      totalTasks: total,
      completed,
      inProgress,
      pending: pendingCount,
      overdue,
      completionRate,
      remainingTaskIds: remaining.map((t) => t.id),
    };

    if (existing.length) {
      await db.update(dailySummaries).set(summaryData).where(eq(dailySummaries.id, existing[0].id));
    } else {
      await db.insert(dailySummaries).values({
        id: summaryId,
        userId: user.id,
        date: today,
        ...summaryData,
      });
    }

    const pendingList = remaining.length
      ? remaining
          .slice(0, 25)
          .map((t, i) =>
            formatTaskLine(
              {
                title: t.title,
                dueTime: t.dueTime,
                projectName: t.projectName,
                daily: Boolean(t.dailyNotify || t.recurrence === "daily"),
              },
              i + 1,
            ),
          )
          .join("\n")
      : "None — all caught up.";
    const morePending = remaining.length > 25 ? `\n…and ${remaining.length - 25} more` : "";

    const doneList = completedTasks.length
      ? completedTasks
          .slice(0, 12)
          .map((t) => `- ${t.title}${t.projectName ? ` [${t.projectName}]` : ""}`)
          .join("\n")
      : "- none completed yet";

    if (user.notificationPrefs?.inAppEnabled !== false) {
      await createNotification({
        userId: user.id,
        type: "daily_summary",
        title:
          remaining.length > 0
            ? `Pending tasks · ${remaining.length} still open`
            : "End of day · all caught up",
        body:
          remaining.length > 0
            ? `After 5:00 PM: ${remaining.length} pending task${remaining.length !== 1 ? "s" : ""} — ${remaining
                .slice(0, 3)
                .map((t) => t.title)
                .join(", ")}${remaining.length > 3 ? "…" : ""}`
            : `${completed}/${total} completed (${completionRate}%). Nice work.`,
        link: "/dashboard",
      });
    }

    await sendDiscordWebhook(
      null,
      "dailySummary",
      [
        `🕔 EOD · ${user.name} · ${today}`,
        `done ${completed}  ·  active ${inProgress}  ·  pending ${pendingCount}  ·  overdue ${overdue}  ·  ${completionRate}%`,
        "",
        "Your pending tasks",
        pendingList + morePending,
        "",
        "Work completed",
        doneList,
      ].join("\n"),
    );

    if (wantsEmail(user) && user.email) {
      try {
        const result = await sendPendingTasksEmail({
          to: user.email,
          name: user.name,
          date: today,
          pending: remaining.map(toDigestLine),
          completedCount: completed,
          totalCount: total,
        });
        if ("skipped" in result && result.skipped) {
          logger.warn("worker.eod.email_skipped", { userId: user.id, reason: result.reason });
        } else {
          logger.info("worker.eod.email_sent", {
            userId: user.id,
            pending: remaining.length,
          });
        }
      } catch (err) {
        logger.error("worker.eod.email_failed", { userId: user.id, err });
      }
    }
  }
}

const jobHandlers: Record<string, () => Promise<void>> = {
  "morning-reminder": morningReminderJob,
  "tomorrow-preview": tomorrowPreviewJob,
  "deadline-check": deadlineCheckJob,
  "overdue-mark": overdueMarkJob,
  "eod-summary": eodSummaryJob,
};

async function setupRepeatableJobs(queue: Queue) {
  // Morning 8:30 + EOD 5:00 are timezone-aware; worker ticks every 15 minutes.
  const schedulers = [
    { id: "morning-reminder", pattern: "*/15 * * * *" },
    { id: "tomorrow-preview", pattern: "0 20 * * *" },
    { id: "deadline-check", pattern: "*/15 * * * *" },
    { id: "overdue-mark", pattern: "0 * * * *" },
    { id: "eod-summary", pattern: "*/15 * * * *" },
  ] as const;

  for (const { id, pattern } of schedulers) {
    await queue.upsertJobScheduler(id, { pattern }, { name: id, data: {} });
  }
  logger.info("worker.schedulers.ready", {
    morningLocal: "08:30",
    eodLocal: "17:00",
    tick: "*/15",
  });
}

async function main() {
  const queue = new Queue(QUEUE_NAME, { connection });
  await setupRepeatableJobs(queue);

  // Allow manual trigger via CLI: pnpm worker:dev --run morning-reminder
  const runOnce = process.argv.find((a) => a.startsWith("--run="))?.split("=")[1];
  if (runOnce && jobHandlers[runOnce]) {
    await jobHandlers[runOnce]();
    logger.info("worker.run_once.done", { job: runOnce });
    process.exit(0);
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const handler = jobHandlers[job.name];
      if (handler) await handler();
      else logger.warn("worker.job.unknown", { job: job.name });
    },
    { connection },
  );

  worker.on("completed", (job) => logger.info("worker.job.completed", { job: job.name }));
  worker.on("failed", (job, err) =>
    logger.error("worker.job.failed", { job: job?.name, err }),
  );
  worker.on("error", (err) => logger.error("worker.error", { err }));

  function shutdown(signal: string) {
    logger.info("worker.shutdown", { signal });
    void worker
      .close()
      .then(() => queue.close())
      .then(() => connection.quit())
      .finally(() => process.exit(0));
  }
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info("worker.started", { queue: QUEUE_NAME });
}

main().catch((err) => {
  logger.error("worker.fatal", { err });
  process.exit(1);
});
