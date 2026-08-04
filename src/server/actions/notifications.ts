"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { requireSession } from "@/server/session";

export async function getNotifications() {
  const session = await requireSession();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
}

export async function getUnreadNotificationCount() {
  const session = await requireSession();
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.user.id));
  return rows.filter((n) => !n.read).length;
}

export async function markNotificationRead(id: string) {
  await requireSession();
  await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, id));
  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const session = await requireSession();
  await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.userId, session.user.id));
  revalidatePath("/notifications");
  return { ok: true };
}

export async function deleteNotificationAction(id: string) {
  await requireSession();
  await db.delete(notifications).where(eq(notifications.id, id));
  revalidatePath("/notifications");
  return { ok: true };
}
