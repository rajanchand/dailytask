import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("role", [
  "super_admin",
  "admin",
  "manager",
  "team_leader",
  "member",
  "viewer",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "not_started",
  "working_on_it",
  "in_progress",
  "blocked",
  "waiting",
  "review",
  "completed",
  "cancelled",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "critical",
  "high",
  "medium",
  "low",
  "none",
]);

export const recurrenceEnum = pgEnum("recurrence", [
  "none",
  "daily",
  "weekly",
  "monthly",
  "custom",
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  image: text("image"),
  address: text("address"),
  phone: text("phone"),
  contactNumber: text("contact_number"),
  role: roleEnum("role").notNull().default("member"),
  timezone: text("timezone").notNull().default("UTC"),
  disabled: boolean("disabled").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  notificationPrefs: jsonb("notification_prefs")
    .$type<{
      morningReminder: boolean;
      tomorrowPreview: boolean;
      deadlineReminder: boolean;
      overdue: boolean;
      taskAssigned: boolean;
      taskCompleted: boolean;
      dailySummary: boolean;
      emailEnabled: boolean;
      inAppEnabled: boolean;
    }>()
    .notNull()
    .default({
      morningReminder: true,
      tomorrowPreview: true,
      deadlineReminder: true,
      overdue: true,
      taskAssigned: true,
      taskCompleted: true,
      dailySummary: true,
      emailEnabled: false,
      inAppEnabled: true,
    }),
  resetToken: text("reset_token"),
  resetTokenExpires: timestamp("reset_token_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("member"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("team_member_unique").on(t.teamId, t.userId)],
);

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#0d9488"),
  teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#64748b"),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
});

export const tags = pgTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
});

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    notes: text("notes"),
    date: text("date").notNull(), // YYYY-MM-DD
    startTime: text("start_time"), // HH:mm
    dueTime: text("due_time"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    status: taskStatusEnum("status").notNull().default("not_started"),
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    recurrence: recurrenceEnum("recurrence").notNull().default("none"),
    recurrenceRule: jsonb("recurrence_rule").$type<{
      weekdays?: number[];
      interval?: number;
      until?: string;
      time?: string;
    }>(),
    progress: integer("progress").notNull().default(0),
    isOverdue: boolean("is_overdue").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_date_idx").on(t.date),
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_status_idx").on(t.status),
  ],
);

export const taskTags = pgTable(
  "task_tags",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("task_tag_unique").on(t.taskId, t.tagId)],
);

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attachments = pgTable("attachments", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  uploadedById: text("uploaded_by_id")
    .notNull()
    .references(() => users.id),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    read: boolean("read").notNull().default(false),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export const reminders = pgTable("reminders", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  type: text("type").notNull().default("deadline"),
  sent: boolean("sent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const discordIntegrations = pgTable("discord_integrations", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" })
    .unique(),
  webhookUrl: text("webhook_url").notNull(),
  serverName: text("server_name"),
  channelName: text("channel_name"),
  enabled: boolean("enabled").notNull().default(true),
  eventTypes: jsonb("event_types")
    .$type<{
      taskCreated: boolean;
      taskAssigned: boolean;
      statusChanged: boolean;
      taskCompleted: boolean;
      taskOverdue: boolean;
      morningReminder: boolean;
      dailySummary: boolean;
    }>()
    .notNull()
    .default({
      taskCreated: true,
      taskAssigned: true,
      statusChanged: true,
      taskCompleted: true,
      taskOverdue: true,
      morningReminder: true,
      dailySummary: true,
    }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_logs_created_idx").on(t.createdAt)],
);

export const sessionStatusEnum = pgEnum("session_status", [
  "active",
  "logged_out",
  "expired",
]);

/** Login / security telemetry for System Health (IP, UA, logout times). */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    browser: text("browser"),
    device: text("device"),
    status: sessionStatusEnum("status").notNull().default("active"),
    loginAt: timestamp("login_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    logoutAt: timestamp("logout_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("user_sessions_user_idx").on(t.userId),
    index("user_sessions_login_idx").on(t.loginAt),
    index("user_sessions_status_idx").on(t.status),
  ],
);

export const dailySummaries = pgTable(
  "daily_summaries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    totalTasks: integer("total_tasks").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    inProgress: integer("in_progress").notNull().default(0),
    pending: integer("pending").notNull().default(0),
    overdue: integer("overdue").notNull().default(0),
    completionRate: integer("completion_rate").notNull().default(0),
    remainingTaskIds: jsonb("remaining_task_ids").$type<string[]>().notNull().default([]),
    dismissed: boolean("dismissed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("daily_summary_user_date").on(t.userId, t.date)],
);

export const usersRelations = relations(users, ({ many }) => ({
  tasksAssigned: many(tasks, { relationName: "assignee" }),
  tasksCreated: many(tasks, { relationName: "creator" }),
  teamMemberships: many(teamMembers),
  notifications: many(notifications),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: "assignee",
  }),
  creator: one(users, {
    fields: [tasks.createdById],
    references: [users.id],
    relationName: "creator",
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  category: one(categories, {
    fields: [tasks.categoryId],
    references: [categories.id],
  }),
  comments: many(comments),
  attachments: many(attachments),
  taskTags: many(taskTags),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  tasks: many(tasks),
}));

export type User = typeof users.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskPriority = (typeof taskPriorityEnum.enumValues)[number];
