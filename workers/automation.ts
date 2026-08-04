import "dotenv/config";
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { and, eq, lte, ne } from "drizzle-orm";
import { format, addDays } from "date-fns";
import { db } from "../src/server/db";
import { tasks, users, dailySummaries, reminders } from "../src/server/db/schema";
import { createNotification, logActivity } from "../src/server/services/activity";
import { sendDiscordWebhook, formatDailySummaryDiscord } from "../src/server/services/discord";
import { newId, todayISO } from "../src/lib/utils";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const QUEUE_NAME = "dailyflow-automation";

async function morningReminderJob() {
  console.log("[worker] Running morning reminder...");
  const today = todayISO();
  const allUsers = await db.select().from(users).where(eq(users.disabled, false));

  for (const user of allUsers) {
    if (user.notificationPrefs?.morningReminder === false) continue;
    if (user.notificationPrefs?.inAppEnabled === false) continue;

    const dayTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeId, user.id),
          eq(tasks.date, today),
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
      type: "morning_reminder",
      title: "Good morning! Your plan for today",
      body: `You have ${dayTasks.length} task${dayTasks.length !== 1 ? "s" : ""} assigned for today.\n${titles}${more}`,
      link: "/planner",
    });

    await sendDiscordWebhook(
      null,
      "morningReminder",
      `🌅 **Morning Reminder — ${user.name}**\n${dayTasks.length} tasks today\n${titles}${more}`,
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
  console.log("[worker] Running EOD summary...");
  const today = todayISO();
  const allUsers = await db.select().from(users).where(eq(users.disabled, false));

  for (const user of allUsers) {
    if (user.notificationPrefs?.dailySummary === false) continue;

    const dayTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.assigneeId, user.id), eq(tasks.date, today)));

    const completed = dayTasks.filter((t) => t.status === "completed").length;
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

    await createNotification({
      userId: user.id,
      type: "daily_summary",
      title: "Daily Summary",
      body: `📊 Daily Summary: ${completed}/${total} completed. ${remaining.length} remaining.`,
      link: "/dashboard",
    });

    await sendDiscordWebhook(
      null,
      "dailySummary",
      formatDailySummaryDiscord({
        userName: user.name,
        date: format(new Date(), "EEEE, d MMMM yyyy"),
        completed,
        inProgress,
        pending,
        remaining: remaining.map((t) => t.title),
      }),
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
  const schedulers = [
    { id: "morning-reminder", pattern: "0 8 * * *" },
    { id: "tomorrow-preview", pattern: "0 20 * * *" },
    { id: "deadline-check", pattern: "*/15 * * * *" },
    { id: "overdue-mark", pattern: "0 * * * *" },
    { id: "eod-summary", pattern: "0 18 * * *" },
  ] as const;

  for (const { id, pattern } of schedulers) {
    await queue.upsertJobScheduler(id, { pattern }, { name: id, data: {} });
  }
  console.log("[worker] Repeatable jobs scheduled");
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
