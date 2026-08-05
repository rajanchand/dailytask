import "dotenv/config";
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { and, eq, lte, ne, isNotNull } from "drizzle-orm";
import { format, addDays } from "date-fns";
import { db } from "../src/server/db";
import { tasks, users, dailySummaries, reminders, calendarEntries } from "../src/server/db/schema";
import { createNotification, logActivity } from "../src/server/services/activity";
import { sendDiscordWebhook } from "../src/server/services/discord";
import { newId, todayISO } from "../src/lib/utils";

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

async function morningReminderJob() {
  console.log("[worker] Running morning task report (08:30 local window)...");
  const now = new Date();
  const allUsers = await db.select().from(users).where(eq(users.disabled, false));

  for (const user of allUsers) {
    if (user.notificationPrefs?.morningReminder === false) continue;

    const tz = user.timezone?.trim() || "UTC";
    if (!isLocalMorningReportWindow(now, tz)) continue;

    const today = todayISOInTimezone(tz, now);
    const dayTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.assigneeId, user.id), eq(tasks.date, today)));

    const open = dayTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
    const completed = dayTasks.filter((t) => t.status === "completed");
    const inProgress = dayTasks.filter((t) =>
      ["in_progress", "working_on_it", "review"].includes(t.status),
    );
    const pending = dayTasks.filter((t) =>
      ["not_started", "waiting", "blocked"].includes(t.status),
    );
    const overdue = dayTasks.filter((t) => t.isOverdue && t.status !== "completed");

    const openLines = open.length
      ? open
          .slice(0, 10)
          .map((t, i) => `${i + 1}. ${t.title}${t.dueTime ? ` (due ${t.dueTime})` : ""}`)
          .join("\n")
      : "None — clear calendar.";
    const more = open.length > 10 ? `\n…and ${open.length - 10} more` : "";

    const reportBody = [
      `Today · ${today}`,
      `total ${dayTasks.length}  ·  done ${completed.length}  ·  active ${inProgress.length}  ·  pending ${pending.length}  ·  overdue ${overdue.length}`,
      "",
      "Your tasks",
      openLines + more,
    ].join("\n");

    if (user.notificationPrefs?.inAppEnabled !== false) {
      await createNotification({
        userId: user.id,
        type: "morning_reminder",
        title: "Morning task report · 8:30",
        body: `You have ${open.length} open task${open.length !== 1 ? "s" : ""} today (${completed.length} already done).`,
        link: "/planner",
      });
    }

    await sendDiscordWebhook(
      null,
      "morningReminder",
      `Morning report · ${user.name}\n${reportBody}`,
    );
  }
}

async function tomorrowPreviewJob() {
  console.log("[worker] Running tomorrow preview...");
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
  console.log("[worker] Running deadline check...");
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
  console.log("[worker] Running overdue mark...");
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
  console.log("[worker] Running EOD summary (17:00 local window)...");
  const now = new Date();
  const allUsers = await db.select().from(users).where(eq(users.disabled, false));

  for (const user of allUsers) {
    if (user.notificationPrefs?.dailySummary === false) continue;

    const tz = user.timezone?.trim() || "UTC";
    if (!isLocalEodWindow(now, tz)) continue;

    const today = todayISOInTimezone(tz, now);
    const dayTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.assigneeId, user.id), eq(tasks.date, today)));

    const completedTasks = dayTasks.filter((t) => t.status === "completed");
    const completed = completedTasks.length;
    const inProgress = dayTasks.filter((t) =>
      ["in_progress", "working_on_it", "review"].includes(t.status),
    ).length;
    const pending = dayTasks.filter((t) =>
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
      pending,
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

    const doneList = completedTasks.length
      ? completedTasks
          .slice(0, 12)
          .map((t) => `- ${t.title}`)
          .join("\n")
      : "- none completed yet";

    if (user.notificationPrefs?.inAppEnabled !== false) {
      await createNotification({
        userId: user.id,
        type: "daily_summary",
        title: "End of day summary · 5:00 PM",
        body: `${completed}/${total} completed (${completionRate}%). ${remaining.length} still open.`,
        link: "/dashboard",
      });
    }

    await sendDiscordWebhook(
      null,
      "dailySummary",
      [
        `EOD · ${user.name} · ${today}`,
        `done ${completed}  ·  active ${inProgress}  ·  pending ${pending}  ·  overdue ${overdue}  ·  ${completionRate}%`,
        "",
        "Work completed",
        doneList,
        "",
        "Still open",
        remaining.length
          ? remaining
              .slice(0, 8)
              .map((t) => `- ${t.title}`)
              .join("\n")
          : "- none",
      ].join("\n"),
    );
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
  console.log(
    "[worker] Repeatable jobs scheduled (morning ~08:30 local, EOD ~17:00 local, every 15m tick)",
  );
}

async function main() {
  const queue = new Queue(QUEUE_NAME, { connection });
  await setupRepeatableJobs(queue);

  // Allow manual trigger via CLI: pnpm worker:dev --run morning-reminder
  const runOnce = process.argv.find((a) => a.startsWith("--run="))?.split("=")[1];
  if (runOnce && jobHandlers[runOnce]) {
    await jobHandlers[runOnce]();
    console.log(`[worker] Ran ${runOnce} once`);
    process.exit(0);
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const handler = jobHandlers[job.name];
      if (handler) await handler();
      else console.warn(`Unknown job: ${job.name}`);
    },
    { connection },
  );

  worker.on("completed", (job) => console.log(`[worker] Completed: ${job.name}`));
  worker.on("failed", (job, err) => console.error(`[worker] Failed: ${job?.name}`, err));

  console.log("[worker] Dailyflow automation worker started");
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
