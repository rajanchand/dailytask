"use server";

import { and, eq, gte, ilike, lte, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import {
  tasks,
  taskTags,
  tags,
  users,
  projects,
  categories,
  comments,
  attachments,
  dailySummaries,
} from "@/server/db/schema";
import type { TaskPriority, TaskStatus } from "@/server/db/schema";
import { newId, todayISO, tomorrowISO, progressFromStatus } from "@/lib/utils";
import { requireSession, requireUserPermission } from "@/server/session";
import { hasPermission } from "@/server/rbac";
import { createNotification, logActivity } from "@/server/services/activity";
import { sendDiscordWebhook } from "@/server/services/discord";
import { addDays, format, parseISO } from "date-fns";
import { canAssignTask, canDeleteTask, canUpdateTask, canViewTask } from "@/server/task-access";
import type { Role } from "@/server/db/schema";
import { rateLimitAction } from "@/server/security/rate-limit";

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  notes: z.string().optional(),
  date: z.string().min(1),
  startTime: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  priority: z.enum(["critical", "high", "medium", "low", "none"]),
  status: z.enum([
    "not_started",
    "working_on_it",
    "in_progress",
    "blocked",
    "waiting",
    "review",
    "completed",
    "cancelled",
  ]),
  progress: z.coerce.number().min(0).max(100).optional(),
  assigneeId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly", "custom"]).default("none"),
  dailyNotify: z.boolean().default(false),
  tagNames: z.string().optional(),
});

function parseDailyNotify(formData: FormData, recurrence?: string) {
  const values = formData.getAll("dailyNotify").map(String);
  const checked = values.includes("true") || values.includes("on") || values.includes("1");
  // Daily recurrence always implies morning notify.
  return checked || recurrence === "daily";
}

/** Form empty string → null so optional FK columns stay valid. */
function formText(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

async function spawnDailyOccurrence(
  existing: typeof tasks.$inferSelect,
  actorId: string,
) {
  if (existing.recurrence !== "daily" && !existing.dailyNotify) return;

  const nextDate = format(addDays(parseISO(existing.date), 1), "yyyy-MM-dd");
  const already = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.title, existing.title),
        eq(tasks.date, nextDate),
        existing.assigneeId
          ? eq(tasks.assigneeId, existing.assigneeId)
          : eq(tasks.createdById, existing.createdById),
        existing.projectId
          ? eq(tasks.projectId, existing.projectId)
          : eq(tasks.createdById, existing.createdById),
      ),
    )
    .limit(1);
  if (already.length) return;

  const nextDueAt = existing.dueTime ? new Date(`${nextDate}T${existing.dueTime}:00`) : null;
  const nextId = newId();
  await db.insert(tasks).values({
    id: nextId,
    title: existing.title,
    description: existing.description,
    notes: existing.notes,
    date: nextDate,
    startTime: existing.startTime,
    dueTime: existing.dueTime,
    dueAt: nextDueAt,
    priority: existing.priority,
    status: "not_started",
    progress: 0,
    assigneeId: existing.assigneeId,
    createdById: existing.createdById,
    projectId: existing.projectId,
    categoryId: existing.categoryId,
    teamId: existing.teamId,
    recurrence: existing.recurrence === "none" ? "daily" : existing.recurrence,
    recurrenceRule: existing.recurrenceRule,
    dailyNotify: existing.dailyNotify || existing.recurrence === "daily",
    sortOrder: existing.sortOrder,
  });
  await logActivity({
    userId: actorId,
    action: "task.recurrence_spawned",
    entityType: "task",
    entityId: nextId,
    taskId: nextId,
    details: { fromTaskId: existing.id, date: nextDate, title: existing.title },
  });
}

function revalidateTaskPaths(projectId?: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  revalidatePath("/planner");
  revalidatePath("/kanban");
  revalidatePath("/calendar");
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/analytics");
  revalidatePath("/notifications");
  revalidatePath("/reports");
}

async function notifyAssignee(input: {
  assigneeId: string;
  actorId: string;
  title: string;
  date: string;
  taskId: string;
}) {
  if (input.assigneeId === input.actorId && input.date !== tomorrowISO() && input.date !== todayISO()) {
    return;
  }

  const [assignee] = await db.select().from(users).where(eq(users.id, input.assigneeId)).limit(1);
  if (!assignee?.notificationPrefs?.taskAssigned && !assignee?.notificationPrefs?.inAppEnabled) {
    // still notify assignment unless prefs explicitly off
  }
  if (assignee?.notificationPrefs?.taskAssigned === false) return;

  const isTomorrow = input.date === tomorrowISO();
  await createNotification({
    userId: input.assigneeId,
    type: isTomorrow ? "tomorrow_task" : "task_assigned",
    title: isTomorrow ? "Task scheduled for tomorrow" : "Task assigned",
    body: isTomorrow
      ? `Tomorrow: "${input.title}" is on your plan.`
      : `You were assigned "${input.title}" (${input.date}).`,
    link: `/planner?date=${input.date}`,
  });

  await sendDiscordWebhook(
    null,
    "taskAssigned",
    `📌 **Task assigned**\n**${input.title}**\n👤 ${assignee?.name ?? "member"}\n📅 ${input.date}`,
  );
}

export async function createTaskAction(formData: FormData) {
  const session = await requireUserPermission("tasks.create");
  const recurrence = (formData.get("recurrence") as string) || "none";
  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    notes: formData.get("notes") || undefined,
    date: formData.get("date"),
    startTime: formText(formData, "startTime") ?? null,
    dueTime: formText(formData, "dueTime") ?? null,
    priority: formData.get("priority") || "medium",
    status: formData.get("status") || "not_started",
    progress: formData.get("progress") || undefined,
    assigneeId: formText(formData, "assigneeId"),
    projectId: formText(formData, "projectId"),
    categoryId: formText(formData, "categoryId"),
    recurrence,
    dailyNotify: parseDailyNotify(formData, recurrence),
    tagNames: formData.get("tagNames") || "",
  });

  if (!parsed.success) return { error: "Invalid task data" };

  const taskId = newId();
  const dueAt =
    parsed.data.date && parsed.data.dueTime
      ? new Date(`${parsed.data.date}T${parsed.data.dueTime}:00`)
      : null;

  const assigneeId = parsed.data.assigneeId || session.user.id;
  if (
    assigneeId !== session.user.id &&
    !hasPermission(session.user.role as Role, "tasks.assign")
  ) {
    return { error: "You cannot assign tasks to others" };
  }
  const progress =
    parsed.data.progress ??
    (parsed.data.status === "completed" ? 100 : progressFromStatus(parsed.data.status));

  await db.insert(tasks).values({
    id: taskId,
    title: parsed.data.title,
    description: parsed.data.description,
    notes: parsed.data.notes,
    date: parsed.data.date,
    startTime: parsed.data.startTime,
    dueTime: parsed.data.dueTime,
    dueAt,
    priority: parsed.data.priority,
    status: parsed.data.status,
    progress: parsed.data.status === "completed" ? 100 : progress,
    assigneeId,
    createdById: session.user.id,
    projectId: parsed.data.projectId,
    categoryId: parsed.data.categoryId,
    recurrence: parsed.data.recurrence,
    dailyNotify: parsed.data.dailyNotify,
    completedAt: parsed.data.status === "completed" ? new Date() : null,
  });

  const tagNames = (parsed.data.tagNames || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  for (const name of tagNames) {
    let [tag] = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
    if (!tag) {
      const tagId = newId();
      await db.insert(tags).values({ id: tagId, name });
      tag = { id: tagId, name, color: "#6366f1", teamId: null };
    }
    await db.insert(taskTags).values({ id: newId(), taskId, tagId: tag.id });
  }

  await logActivity({
    userId: session.user.id,
    action: "task.created",
    entityType: "task",
    entityId: taskId,
    taskId,
    details: { title: parsed.data.title, assigneeId },
  });

  await notifyAssignee({
    assigneeId,
    actorId: session.user.id,
    title: parsed.data.title,
    date: parsed.data.date,
    taskId,
  });

  await sendDiscordWebhook(
    null,
    "taskCreated",
    `🆕 **New task**\n${parsed.data.title}\n📅 ${parsed.data.date}`,
  );

  revalidateTaskPaths(parsed.data.projectId);
  return { ok: true, id: taskId };
}

export async function updateTaskAction(taskId: string, formData: FormData) {
  const session = await requireSession();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!existing) return { error: "Task not found" };

  if (!canUpdateTask(session.user.role as Role, session.user.id, existing)) {
    return { error: "Forbidden" };
  }

  const recurrence =
    (formData.get("recurrence") as string) || existing.recurrence;
  const nextProjectId =
    formText(formData, "projectId") === undefined
      ? existing.projectId
      : formText(formData, "projectId");
  const nextCategoryId =
    formText(formData, "categoryId") === undefined
      ? existing.categoryId
      : formText(formData, "categoryId");
  const nextAssigneeRaw =
    formText(formData, "assigneeId") === undefined
      ? existing.assigneeId
      : formText(formData, "assigneeId");
  const nextStartTime =
    formText(formData, "startTime") === undefined
      ? existing.startTime
      : formText(formData, "startTime");
  const nextDueTime =
    formText(formData, "dueTime") === undefined
      ? existing.dueTime
      : formText(formData, "dueTime");

  const parsed = taskSchema.partial({ title: true }).safeParse({
    title: formData.get("title") || existing.title,
    description: formData.get("description") ?? existing.description,
    notes: formData.get("notes") ?? existing.notes,
    date: formData.get("date") || existing.date,
    startTime: nextStartTime,
    dueTime: nextDueTime,
    priority: formData.get("priority") || existing.priority,
    status: formData.get("status") || existing.status,
    progress: formData.get("progress") ?? existing.progress,
    assigneeId: nextAssigneeRaw,
    projectId: nextProjectId,
    categoryId: nextCategoryId,
    recurrence,
    dailyNotify:
      formData.getAll("dailyNotify").length > 0
        ? parseDailyNotify(formData, recurrence)
        : existing.dailyNotify || recurrence === "daily",
  });

  if (!parsed.success) return { error: "Invalid task data" };

  const data = parsed.data;
  const nextStatus = (data.status as TaskStatus) ?? existing.status;
  const dueAt =
    data.date && data.dueTime
      ? new Date(`${data.date}T${data.dueTime}:00`)
      : data.dueTime === null
        ? null
        : existing.dueAt;

  let nextAssignee = existing.assigneeId;
  if (data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId) {
    if (!canAssignTask(session.user.role as Role, session.user.id, existing)) {
      return { error: "You cannot reassign this task" };
    }
    nextAssignee = data.assigneeId;
  }

  let progress =
    typeof data.progress === "number" ? data.progress : existing.progress;
  if (nextStatus === "completed") {
    progress = Math.max(progress, 100);
  } else if (existing.status === "completed") {
    progress = Math.min(progress, 95);
  }

  try {
    await db
      .update(tasks)
      .set({
        title: data.title ?? existing.title,
        description: data.description,
        notes: data.notes,
        date: data.date ?? existing.date,
        startTime: data.startTime,
        dueTime: data.dueTime,
        dueAt,
        priority: (data.priority as TaskPriority) ?? existing.priority,
        status: nextStatus,
        progress,
        assigneeId: nextAssignee,
        projectId: nextProjectId ?? null,
        categoryId: nextCategoryId ?? null,
        recurrence: data.recurrence ?? existing.recurrence,
        dailyNotify: data.dailyNotify ?? existing.dailyNotify,
        completedAt:
          nextStatus === "completed"
            ? existing.completedAt ?? new Date()
            : null,
        isOverdue: nextStatus === "completed" ? false : existing.isOverdue,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  } catch (err) {
    console.error("updateTaskAction failed", err);
    return { error: "Could not save task. Check project and assignee fields." };
  }

  await logActivity({
    userId: session.user.id,
    action: "task.updated",
    entityType: "task",
    entityId: taskId,
    taskId,
    details: { title: data.title, status: nextStatus },
  });

  if (nextAssignee && nextAssignee !== existing.assigneeId) {
    await notifyAssignee({
      assigneeId: nextAssignee,
      actorId: session.user.id,
      title: data.title ?? existing.title,
      date: data.date ?? existing.date,
      taskId,
    });
  }

  if (nextStatus === "completed" && existing.status !== "completed") {
    await sendDiscordWebhook(
      existing.teamId,
      "taskCompleted",
      `✅ **Task completed**\n${data.title ?? existing.title}`,
    );
    await spawnDailyOccurrence(
      { ...existing, status: nextStatus, date: data.date ?? existing.date },
      session.user.id,
    );
  } else if (nextStatus !== existing.status) {
    await sendDiscordWebhook(
      existing.teamId,
      "statusChanged",
      `🔄 **Status changed**\n${data.title ?? existing.title}: ${existing.status} → ${nextStatus}`,
    );
  }

  revalidateTaskPaths(nextProjectId ?? existing.projectId);
  return { ok: true };
}

export async function updateTaskStatusAction(taskId: string, status: TaskStatus) {
  const session = await requireSession();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!existing) return { error: "Not found" };

  if (!canUpdateTask(session.user.role as Role, session.user.id, existing)) {
    return { error: "Forbidden" };
  }

  if (existing.status === status) return { ok: true };

  const progress =
    status === "completed"
      ? 100
      : Math.max(existing.progress, progressFromStatus(status));

  try {
    await db
      .update(tasks)
      .set({
        status,
        progress,
        completedAt: status === "completed" ? new Date() : null,
        isOverdue: status === "completed" ? false : existing.isOverdue,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  } catch (err) {
    console.error("updateTaskStatusAction failed", err);
    return { error: "Could not update status. Please try again." };
  }

  await logActivity({
    userId: session.user.id,
    action: "task.status_changed",
    entityType: "task",
    entityId: taskId,
    taskId,
    details: { from: existing.status, to: status, title: existing.title },
  });

  if (status === "completed") {
    await createNotification({
      userId: session.user.id,
      type: "task_completed",
      title: "Task completed",
      body: `✅ Task "${existing.title}" completed successfully.`,
      link: "/planner",
    });
    await sendDiscordWebhook(
      existing.teamId,
      "taskCompleted",
      `✅ **Task completed**\n${existing.title}`,
    );
    await spawnDailyOccurrence(existing, session.user.id);
  } else {
    await sendDiscordWebhook(
      existing.teamId,
      "statusChanged",
      `🔄 **Status changed**\n${existing.title}: ${existing.status} → ${status}`,
    );
  }

  revalidateTaskPaths(existing.projectId);
  return { ok: true };
}

export async function updateTaskProgressAction(taskId: string, progress: number) {
  const session = await requireSession();
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!existing) return { error: "Not found" };

  if (!canUpdateTask(session.user.role as Role, session.user.id, existing)) {
    return { error: "Forbidden" };
  }

  let status = existing.status;
  if (value >= 100) status = "completed";
  else if (value >= 85 && existing.status !== "blocked") status = "review";
  else if (value >= 50 && ["not_started", "working_on_it"].includes(existing.status)) {
    status = "in_progress";
  } else if (value > 0 && existing.status === "not_started") {
    status = "working_on_it";
  } else if (value < 100 && existing.status === "completed") {
    status = "in_progress";
  }

  await db
    .update(tasks)
    .set({
      progress: value,
      status,
      completedAt: value >= 100 ? new Date() : null,
      isOverdue: value >= 100 ? false : existing.isOverdue,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await logActivity({
    userId: session.user.id,
    action: "task.progress_updated",
    entityType: "task",
    entityId: taskId,
    taskId,
    details: { progress: value, status, title: existing.title },
  });

  revalidateTaskPaths();
  return { ok: true, progress: value, status };
}

export async function assignTaskAction(taskId: string, assigneeId: string | null) {
  const session = await requireSession();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!existing) return { error: "Not found" };

  if (!canAssignTask(session.user.role as Role, session.user.id, existing)) {
    return { error: "Forbidden" };
  }

  await db
    .update(tasks)
    .set({ assigneeId, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  await logActivity({
    userId: session.user.id,
    action: "task.assigned",
    entityType: "task",
    entityId: taskId,
    taskId,
    details: { assigneeId, title: existing.title },
  });

  if (assigneeId) {
    await notifyAssignee({
      assigneeId,
      actorId: session.user.id,
      title: existing.title,
      date: existing.date,
      taskId,
    });
  }

  revalidateTaskPaths();
  return { ok: true };
}

export async function rescheduleTaskAction(taskId: string, date: string, dueTime?: string | null) {
  const session = await requireSession();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!existing) return { error: "Not found" };

  if (!canUpdateTask(session.user.role as Role, session.user.id, existing)) {
    return { error: "Forbidden" };
  }

  const dueAt = dueTime ? new Date(`${date}T${dueTime}:00`) : existing.dueAt;
  await db
    .update(tasks)
    .set({
      date,
      dueTime: dueTime ?? existing.dueTime,
      dueAt,
      isOverdue: false,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await logActivity({
    userId: session.user.id,
    action: "task.rescheduled",
    entityType: "task",
    entityId: taskId,
    taskId,
    details: { date, dueTime, title: existing.title },
  });

  revalidateTaskPaths();
  return { ok: true };
}

export async function deleteTaskAction(taskId: string) {
  const session = await requireSession();
  const limited = await rateLimitAction("task-delete", 20, 60 * 15, session.user.id);
  if (!limited.ok) {
    return { error: "Too many delete attempts. Try again later." };
  }

  const parsedId = z.string().min(1).max(64).safeParse(taskId);
  if (!parsedId.success) {
    return { error: "Invalid task" };
  }

  const [existing] = await db.select().from(tasks).where(eq(tasks.id, parsedId.data)).limit(1);
  if (!existing) return { error: "Not found" };

  if (!canDeleteTask(session.user.role as Role, session.user.id, existing)) {
    return { error: "Forbidden" };
  }

  // Hard delete — comments, attachments, and task_tags cascade via FK
  await db.delete(tasks).where(eq(tasks.id, parsedId.data));
  await logActivity({
    userId: session.user.id,
    action: "task.deleted",
    entityType: "task",
    entityId: parsedId.data,
    taskId: null,
    details: { title: existing.title },
  });
  revalidateTaskPaths();
  return { ok: true };
}

export async function getTasks(filters?: {
  date?: string;
  q?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  projectId?: string;
  overdue?: boolean;
  assignedToMe?: boolean;
  from?: string;
  to?: string;
}) {
  const session = await requireSession();
  const conditions = [];

  if (filters?.date) conditions.push(eq(tasks.date, filters.date));
  if (filters?.from) conditions.push(gte(tasks.date, filters.from));
  if (filters?.to) conditions.push(lte(tasks.date, filters.to));
  if (filters?.status) conditions.push(eq(tasks.status, filters.status as TaskStatus));
  if (filters?.priority) conditions.push(eq(tasks.priority, filters.priority as TaskPriority));
  if (filters?.projectId) conditions.push(eq(tasks.projectId, filters.projectId));
  if (filters?.overdue) conditions.push(eq(tasks.isOverdue, true));
  if (filters?.assignedToMe || filters?.assigneeId === "me") {
    conditions.push(eq(tasks.assigneeId, session.user.id));
  } else if (filters?.assigneeId) {
    conditions.push(eq(tasks.assigneeId, filters.assigneeId));
  }
  if (filters?.q) {
    conditions.push(
      or(ilike(tasks.title, `%${filters.q}%`), ilike(tasks.description, `%${filters.q}%`))!,
    );
  }

  const rows = await db
    .select({
      task: tasks,
      assigneeName: users.name,
      projectName: projects.name,
      categoryName: categories.name,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(categories, eq(tasks.categoryId, categories.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(tasks.sortOrder, tasks.createdAt);

  return rows.map((r) => ({
    ...r.task,
    assigneeName: r.assigneeName,
    projectName: r.projectName,
    categoryName: r.categoryName,
  }));
}

export async function getDashboardStats(date = todayISO()) {
  const session = await requireSession();
  const dayTasks = await getTasks({ date, assignedToMe: true });
  const overdueTasks = await getTasks({ overdue: true, assignedToMe: true });

  const total = dayTasks.length;
  const completed = dayTasks.filter((t) => t.status === "completed").length;
  const inProgress = dayTasks.filter((t) =>
    ["in_progress", "working_on_it", "review"].includes(t.status),
  ).length;
  const pending = dayTasks.filter((t) =>
    ["not_started", "waiting", "blocked"].includes(t.status),
  ).length;
  const overdue = overdueTasks.filter((t) => t.status !== "completed").length;
  const progress = total ? Math.round((completed / total) * 100) : 0;

  return {
    user: session.user,
    date,
    total,
    completed,
    inProgress,
    pending,
    overdue,
    progress,
    tasks: dayTasks,
  };
}

export async function moveRemainingToTomorrowAction(date?: string) {
  const session = await requireSession();
  const d = date ?? todayISO();
  const dayTasks = await getTasks({ date: d, assignedToMe: true });
  const remaining = dayTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const tomorrow = format(addDays(parseISO(d), 1), "yyyy-MM-dd");

  for (const task of remaining) {
    await db
      .update(tasks)
      .set({ date: tomorrow, isOverdue: false, updatedAt: new Date() })
      .where(eq(tasks.id, task.id));
  }

  await logActivity({
    userId: session.user.id,
    action: "tasks.moved_to_tomorrow",
    entityType: "daily_summary",
    details: { count: remaining.length, from: d, to: tomorrow },
  });

  revalidateTaskPaths();
  return { ok: true, count: remaining.length };
}

export async function completeRemainingAction(date?: string) {
  await requireSession();
  const d = date ?? todayISO();
  const dayTasks = await getTasks({ date: d, assignedToMe: true });
  const remaining = dayTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  for (const task of remaining) {
    await updateTaskStatusAction(task.id, "completed");
  }
  revalidateTaskPaths();
  return { ok: true };
}

export async function dismissDailySummaryAction(date?: string) {
  const session = await requireSession();
  const d = date ?? todayISO();
  await db
    .insert(dailySummaries)
    .values({
      id: newId(),
      userId: session.user.id,
      date: d,
      dismissed: true,
    })
    .onConflictDoUpdate({
      target: [dailySummaries.userId, dailySummaries.date],
      set: { dismissed: true },
    });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getTaskFormOptions() {
  await requireSession();
  const [allUsers, allProjects, allCategories, allTags] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
    db.select().from(projects).where(eq(projects.archived, false)),
    db.select().from(categories),
    db.select().from(tags),
  ]);
  return { users: allUsers, projects: allProjects, categories: allCategories, tags: allTags };
}

export async function addCommentAction(taskId: string, body: string) {
  const session = await requireSession();
  if (!body.trim()) return { error: "Empty comment" };
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!existing) return { error: "Not found" };
  if (!canViewTask(session.user.role as Role, session.user.id, existing)) {
    return { error: "Forbidden" };
  }
  await db.insert(comments).values({
    id: newId(),
    taskId,
    authorId: session.user.id,
    body: body.trim(),
  });
  revalidatePath("/tasks");
  return { ok: true };
}

export async function addAttachmentMetaAction(input: {
  taskId: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  sizeBytes?: number;
}) {
  const session = await requireSession();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
  if (!existing) return { error: "Not found" };
  if (!canUpdateTask(session.user.role as Role, session.user.id, existing)) {
    return { error: "Forbidden" };
  }
  await db.insert(attachments).values({
    id: newId(),
    taskId: input.taskId,
    uploadedById: session.user.id,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
  revalidatePath("/tasks");
  return { ok: true };
}
