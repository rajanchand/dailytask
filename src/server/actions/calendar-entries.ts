"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { calendarEntries, type CalendarEntryType } from "@/server/db/schema";
import { newId } from "@/lib/utils";
import { requireSession } from "@/server/session";
import { logActivity } from "@/server/services/activity";

const entryTypeSchema = z.enum(["event", "notes", "reminder"]);

const entrySchema = z.object({
  type: entryTypeSchema.default("event"),
  title: z.string().min(1).max(200),
  notes: z.string().max(5000).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  allDay: z.boolean().default(true),
  remindAt: z.string().datetime({ offset: true }).optional().nullable(),
});

function parseForm(formData: FormData) {
  const startTimeRaw = String(formData.get("startTime") || "").trim();
  const endTimeRaw = String(formData.get("endTime") || "").trim();
  const remindAtLocal = String(formData.get("remindAt") || "").trim();
  const allDay = formData.get("allDay") === "on" || formData.get("allDay") === "true";

  let remindAt: string | null = null;
  if (remindAtLocal) {
    const parsed = new Date(remindAtLocal);
    if (!Number.isNaN(parsed.getTime())) {
      remindAt = parsed.toISOString();
    }
  }

  return entrySchema.safeParse({
    type: formData.get("type") || "event",
    title: String(formData.get("title") || "").trim(),
    notes: String(formData.get("notes") || "").trim() || null,
    date: formData.get("date"),
    startTime: startTimeRaw || null,
    endTime: endTimeRaw || null,
    allDay: allDay || !startTimeRaw,
    remindAt,
  });
}

function revalidateCalendar() {
  revalidatePath("/calendar");
}

async function requireOwnedEntry(entryId: string, userId: string) {
  const [entry] = await db
    .select()
    .from(calendarEntries)
    .where(eq(calendarEntries.id, entryId))
    .limit(1);
  if (!entry) return { error: "Entry not found" as const };
  if (entry.userId !== userId) return { error: "Forbidden" as const };
  return { entry };
}

export async function getCalendarEntries(filters?: { from?: string; to?: string; date?: string }) {
  const session = await requireSession();
  const conditions = [eq(calendarEntries.userId, session.user.id)];
  if (filters?.date) conditions.push(eq(calendarEntries.date, filters.date));
  if (filters?.from) conditions.push(gte(calendarEntries.date, filters.from));
  if (filters?.to) conditions.push(lte(calendarEntries.date, filters.to));

  return db
    .select()
    .from(calendarEntries)
    .where(and(...conditions))
    .orderBy(calendarEntries.date, calendarEntries.startTime);
}

export async function createCalendarEntryAction(formData: FormData) {
  const session = await requireSession();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: "Invalid entry data" };

  const id = newId();
  const data = parsed.data;
  const remindAt = data.remindAt ? new Date(data.remindAt) : null;

  await db.insert(calendarEntries).values({
    id,
    userId: session.user.id,
    type: data.type as CalendarEntryType,
    title: data.title,
    notes: data.notes,
    date: data.date,
    startTime: data.allDay ? null : data.startTime,
    endTime: data.allDay ? null : data.endTime,
    allDay: data.allDay,
    remindAt,
    reminderSent: false,
  });

  await logActivity({
    userId: session.user.id,
    action: "calendar_entry.created",
    entityType: "calendar_entry",
    entityId: id,
    details: { type: data.type, title: data.title, date: data.date },
  });

  revalidateCalendar();
  return { ok: true, id };
}

export async function updateCalendarEntryAction(entryId: string, formData: FormData) {
  const session = await requireSession();
  const owned = await requireOwnedEntry(entryId, session.user.id);
  if ("error" in owned) return { error: owned.error };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: "Invalid entry data" };

  const data = parsed.data;
  const remindAt = data.remindAt ? new Date(data.remindAt) : null;
  const prev = owned.entry;
  const remindChanged =
    (prev.remindAt?.getTime() ?? null) !== (remindAt?.getTime() ?? null);

  await db
    .update(calendarEntries)
    .set({
      type: data.type as CalendarEntryType,
      title: data.title,
      notes: data.notes,
      date: data.date,
      startTime: data.allDay ? null : data.startTime,
      endTime: data.allDay ? null : data.endTime,
      allDay: data.allDay,
      remindAt,
      ...(remindChanged ? { reminderSent: false } : {}),
      updatedAt: new Date(),
    })
    .where(eq(calendarEntries.id, entryId));

  await logActivity({
    userId: session.user.id,
    action: "calendar_entry.updated",
    entityType: "calendar_entry",
    entityId: entryId,
    details: { type: data.type, title: data.title, date: data.date },
  });

  revalidateCalendar();
  return { ok: true };
}

export async function deleteCalendarEntryAction(entryId: string) {
  const session = await requireSession();
  const owned = await requireOwnedEntry(entryId, session.user.id);
  if ("error" in owned) return { error: owned.error };

  await db.delete(calendarEntries).where(eq(calendarEntries.id, entryId));

  await logActivity({
    userId: session.user.id,
    action: "calendar_entry.deleted",
    entityType: "calendar_entry",
    entityId: entryId,
  });

  revalidateCalendar();
  return { ok: true };
}

export async function rescheduleCalendarEntryAction(
  entryId: string,
  date: string,
  startTime?: string | null,
) {
  const session = await requireSession();
  const owned = await requireOwnedEntry(entryId, session.user.id);
  if ("error" in owned) return { error: owned.error };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Invalid date" };

  const allDay = !startTime;
  await db
    .update(calendarEntries)
    .set({
      date,
      startTime: allDay ? null : startTime,
      allDay,
      updatedAt: new Date(),
    })
    .where(eq(calendarEntries.id, entryId));

  await logActivity({
    userId: session.user.id,
    action: "calendar_entry.rescheduled",
    entityType: "calendar_entry",
    entityId: entryId,
    details: { date, startTime: startTime ?? null },
  });

  revalidateCalendar();
  return { ok: true };
}
