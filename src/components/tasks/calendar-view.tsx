"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventDropArg } from "@fullcalendar/core";
import { toast } from "sonner";
import { rescheduleTaskAction } from "@/server/actions/tasks";
import { STATUS_LABELS } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  date: string;
  startTime?: string | null;
  dueTime?: string | null;
  status: string;
  priority: string;
};

export function CalendarView({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const events = tasks.map((task) => {
    const start = task.startTime
      ? `${task.date}T${task.startTime}:00`
      : task.date;
    const end = task.dueTime ? `${task.date}T${task.dueTime}:00` : undefined;
    return {
      id: task.id,
      title: task.title,
      start,
      end,
      allDay: !task.startTime,
      extendedProps: { status: task.status, priority: task.priority },
      backgroundColor:
        task.priority === "high"
          ? "#dc2626"
          : task.status === "completed"
            ? "#059669"
            : "#0d9488",
    };
  });

  const onEventDrop = useCallback(
    (info: EventDropArg) => {
      const taskId = info.event.id;
      const newDate = info.event.startStr.slice(0, 10);
      const dueTime = info.event.allDay ? null : info.event.startStr.slice(11, 16);

      startTransition(async () => {
        const result = await rescheduleTaskAction(taskId, newDate, dueTime);
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

  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-fade-up [&_.fc]:text-foreground">
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
        eventDrop={onEventDrop}
        height="auto"
        eventDidMount={(info) => {
          const status = info.event.extendedProps.status as string;
          info.el.title = `${info.event.title} (${STATUS_LABELS[status] ?? status})`;
        }}
      />
    </div>
  );
}
