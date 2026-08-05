"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateClickArg } from "@fullcalendar/interaction";
import type { EventClickArg, EventDropArg } from "@fullcalendar/core";
import { toast } from "sonner";
import { rescheduleTaskAction } from "@/server/actions/tasks";
import {
  createCalendarEntryAction,
  updateCalendarEntryAction,
  deleteCalendarEntryAction,
  rescheduleCalendarEntryAction,
} from "@/server/actions/calendar-entries";
import { STATUS_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Task = {
  id: string;
  title: string;
  date: string;
  startTime?: string | null;
  dueTime?: string | null;
  status: string;
  priority: string;
};

type CalendarEntry = {
  id: string;
  type: "event" | "notes" | "reminder";
  title: string;
  notes?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay: boolean;
  remindAt?: Date | string | null;
};

const ENTRY_COLORS: Record<CalendarEntry["type"], string> = {
  event: "#2563eb",
  notes: "#7c3aed",
  reminder: "#d97706",
};

const TYPE_LABELS: Record<CalendarEntry["type"], string> = {
  event: "Event",
  notes: "Notes",
  reminder: "Reminder",
};

function toDatetimeLocal(value?: Date | string | null) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Field({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

type FormState = {
  id?: string;
  type: CalendarEntry["type"];
  title: string;
  notes: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  remindAt: string;
};

const emptyForm = (date: string): FormState => ({
  type: "event",
  title: "",
  notes: "",
  date,
  startTime: "",
  endTime: "",
  allDay: true,
  remindAt: "",
});

export function CalendarView({
  tasks,
  entries,
}: {
  tasks: Task[];
  entries: CalendarEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(new Date().toISOString().slice(0, 10)));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const events = useMemo(() => {
    const taskEvents = tasks.map((task) => {
      const start = task.startTime ? `${task.date}T${task.startTime}:00` : task.date;
      const end = task.dueTime ? `${task.date}T${task.dueTime}:00` : undefined;
      return {
        id: `task:${task.id}`,
        title: task.title,
        start,
        end,
        allDay: !task.startTime,
        editable: true,
        extendedProps: {
          kind: "task" as const,
          status: task.status,
          priority: task.priority,
          taskId: task.id,
        },
        backgroundColor:
          task.priority === "high"
            ? "#dc2626"
            : task.status === "completed"
              ? "#059669"
              : "#0d9488",
      };
    });

    const entryEvents = entries.map((entry) => {
      const start =
        !entry.allDay && entry.startTime ? `${entry.date}T${entry.startTime}:00` : entry.date;
      const end =
        !entry.allDay && entry.endTime ? `${entry.date}T${entry.endTime}:00` : undefined;
      return {
        id: `entry:${entry.id}`,
        title: entry.title,
        start,
        end,
        allDay: entry.allDay || !entry.startTime,
        editable: true,
        extendedProps: {
          kind: "entry" as const,
          entryId: entry.id,
          type: entry.type,
          notes: entry.notes,
        },
        backgroundColor: ENTRY_COLORS[entry.type],
        borderColor: ENTRY_COLORS[entry.type],
      };
    });

    return [...taskEvents, ...entryEvents];
  }, [tasks, entries]);

  const dayEntries = useMemo(() => {
    if (!selectedDate) return [];
    return entries
      .filter((e) => e.date === selectedDate)
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  }, [entries, selectedDate]);

  const openCreate = useCallback((date: string) => {
    setSelectedDate(date);
    setForm(emptyForm(date));
    setOpen(true);
  }, []);

  const openEdit = useCallback((entry: CalendarEntry) => {
    setSelectedDate(entry.date);
    setForm({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      notes: entry.notes ?? "",
      date: entry.date,
      startTime: entry.startTime ?? "",
      endTime: entry.endTime ?? "",
      allDay: entry.allDay,
      remindAt: toDatetimeLocal(entry.remindAt),
    });
    setOpen(true);
  }, []);

  const onDateClick = useCallback(
    (info: DateClickArg) => {
      openCreate(info.dateStr.slice(0, 10));
    },
    [openCreate],
  );

  const onEventClick = useCallback(
    (info: EventClickArg) => {
      const kind = info.event.extendedProps.kind as string;
      if (kind !== "entry") return;
      const entryId = info.event.extendedProps.entryId as string;
      const entry = entries.find((e) => e.id === entryId);
      if (entry) openEdit(entry);
    },
    [entries, openEdit],
  );

  const onEventDrop = useCallback(
    (info: EventDropArg) => {
      const kind = info.event.extendedProps.kind as string;
      const newDate = info.event.startStr.slice(0, 10);
      const time = info.event.allDay ? null : info.event.startStr.slice(11, 16);

      startTransition(async () => {
        if (kind === "entry") {
          const entryId = info.event.extendedProps.entryId as string;
          const result = await rescheduleCalendarEntryAction(entryId, newDate, time);
          if (result?.error) {
            toast.error(result.error);
            info.revert();
          } else {
            toast.success("Entry moved");
            router.refresh();
          }
          return;
        }

        const taskId = (info.event.extendedProps.taskId as string) || info.event.id.replace(/^task:/, "");
        const result = await rescheduleTaskAction(taskId, newDate, time);
        if (result?.error) {
          toast.error(result.error);
          info.revert();
        } else {
          toast.success("Task rescheduled");
          router.refresh();
        }
      });
    },
    [router, startTransition],
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (form.allDay) {
      formData.set("allDay", "true");
      formData.delete("startTime");
      formData.delete("endTime");
    } else {
      formData.set("allDay", "false");
    }

    startTransition(async () => {
      const result = form.id
        ? await updateCalendarEntryAction(form.id, formData)
        : await createCalendarEntryAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(form.id ? "Entry updated" : "Entry saved");
      setOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!form.id) return;
    startTransition(async () => {
      const result = await deleteCalendarEntryAction(form.id!);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Entry deleted");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="rounded-xl border border-border bg-card p-4 [&_.fc]:text-foreground">
        <p className="mb-3 text-sm text-muted-foreground">
          Click a date to add an event, note, or reminder. Click an entry to edit.
        </p>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={events}
          editable
          droppable
          dateClick={onDateClick}
          eventClick={onEventClick}
          eventDrop={onEventDrop}
          height="auto"
          eventDidMount={(info) => {
            const kind = info.event.extendedProps.kind as string;
            if (kind === "entry") {
              const type = info.event.extendedProps.type as CalendarEntry["type"];
              info.el.title = `${TYPE_LABELS[type] ?? "Entry"}: ${info.event.title}`;
              return;
            }
            const status = info.event.extendedProps.status as string;
            info.el.title = `${info.event.title} (${STATUS_LABELS[status] ?? status})`;
          }}
        />
      </div>

      {selectedDate ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Day agenda</h2>
              <p className="text-sm text-muted-foreground">{selectedDate}</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => openCreate(selectedDate)}>
              Add entry
            </Button>
          </div>
          {dayEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No personal entries for this day.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {dayEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(entry)}
                    className="flex w-full items-start gap-3 py-3 text-left hover:bg-muted/40"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: ENTRY_COLORS[entry.type] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{entry.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {TYPE_LABELS[entry.type]}
                        {!entry.allDay && entry.startTime ? ` · ${entry.startTime}` : " · All day"}
                        {entry.remindAt ? ` · Reminds ${toDatetimeLocal(entry.remindAt).replace("T", " ")}` : ""}
                      </span>
                      {entry.notes ? (
                        <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
                          {entry.notes}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit entry" : "New calendar entry"}</DialogTitle>
            <DialogDescription>
              Save an event, notes, or reminder for {form.date}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="date" value={form.date} />

            <Field id="type" label="Type">
              <div className="flex gap-2">
                {(["event", "notes", "reminder"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      form.type === type
                        ? "border-foreground/20 bg-muted text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <input type="hidden" name="type" value={form.type} />
            </Field>

            <Field id="title" label="Title">
              <Input
                id="title"
                name="title"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={
                  form.type === "notes"
                    ? "Note title"
                    : form.type === "reminder"
                      ? "What to remember"
                      : "Event title"
                }
              />
            </Field>

            <Field id="notes" label={form.type === "notes" ? "Notes" : "Details"}>
              <Textarea
                id="notes"
                name="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional details…"
                rows={3}
              />
            </Field>

            <div className="flex items-center gap-2">
              <input
                id="allDay"
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="allDay" className="text-sm font-normal">
                All day
              </Label>
            </div>

            {!form.allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <Field id="startTime" label="Start">
                  <Input
                    id="startTime"
                    name="startTime"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </Field>
                <Field id="endTime" label="End">
                  <Input
                    id="endTime"
                    name="endTime"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </Field>
              </div>
            ) : null}

            <Field id="remindAt" label="Reminder time">
              <Input
                id="remindAt"
                name="remindAt"
                type="datetime-local"
                value={form.remindAt}
                onChange={(e) => setForm((f) => ({ ...f, remindAt: e.target.value }))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Optional. You&apos;ll get an in-app notification around this time.
              </p>
            </Field>

            <div className="flex items-center justify-between gap-2 pt-1">
              {form.id ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={handleDelete}
                >
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
