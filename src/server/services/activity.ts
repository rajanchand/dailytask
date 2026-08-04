import { db } from "@/server/db";
import { activityLogs, notifications } from "@/server/db/schema";
import { newId } from "@/lib/utils";

export async function logActivity(input: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  taskId?: string | null;
  details?: Record<string, unknown>;
}) {
  await db.insert(activityLogs).values({
    id: newId(),
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    taskId: input.taskId ?? null,
    details: input.details ?? null,
  });
}

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(notifications).values({
    id: newId(),
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link,
    metadata: input.metadata,
  });
}
