"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { TaskForm } from "@/components/tasks/task-form";
import { PriorityBadge } from "@/components/tasks/priority-badge";
import { StatusBadge } from "@/components/tasks/status-badge";
import {
  createTaskAction,
  updateTaskProgressAction,
  updateTaskStatusAction,
  assignTaskAction,
} from "@/server/actions/tasks";
import { STATUS_LABELS, formatDisplayDate, cn } from "@/lib/utils";
import type { TaskStatus } from "@/server/db/schema";

type Task = {
  id: string;
  title: string;
  description?: string | null;
  date: string;
  startTime?: string | null;
  dueTime?: string | null;
  status: string;
  priority: string;
  progress?: number | null;
  isOverdue?: boolean;
  assigneeId?: string | null;
  assigneeName?: string | null;
  projectName?: string | null;
};

type Options = {
  users: { id: string; name: string; email: string }[];
  projects: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

export function PlannerClient({
  date,
  tasks,
  options,
}: {
  date: string;
  tasks: Task[];
  options: Options;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const week = useMemo(() => {
    const base = parseISO(date);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(subDays(base, base.getDay() === 0 ? 6 : base.getDay() - 1), i);
      return format(d, "yyyy-MM-dd");
    });
  }, [date]);

  function go(to: string) {
    router.push(`/planner?date=${to}`);
  }

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createTaskAction(formData);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Task added to plan");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Daily Planner</h2>
          <p className="text-muted-foreground">{formatDisplayDate(date)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => go(format(subDays(parseISO(date), 1), "yyyy-MM-dd"))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={() => go(format(new Date(), "yyyy-MM-dd"))}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => go(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Plan a task</DialogTitle>
              </DialogHeader>
              <form action={handleCreate}>
                <TaskForm
                  options={options}
                  defaultValues={{ date }}
                  submitLabel="Add to plan"
                  pending={pending}
                />
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {week.map((d) => {
          const active = d === date;
          const dayLabel = format(parseISO(d), "EEE");
          const dayNum = format(parseISO(d), "d");
          return (
            <button
              key={d}
              type="button"
              onClick={() => go(d)}
              className={cn(
                "rounded-xl border px-2 py-3 text-center transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              <div className="text-[11px] uppercase tracking-wide opacity-80">{dayLabel}</div>
              <div className="text-lg font-semibold">{dayNum}</div>
            </button>
          );
        })}
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-lg font-medium">No tasks planned 🎉</p>
            <p className="text-sm text-muted-foreground">Your day is clear. Add a task to start planning.</p>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card
              key={task.id}
              className={cn(
                "overflow-hidden",
                (task.priority === "high" || task.priority === "critical") && "priority-high",
                task.isOverdue && "border-destructive/40",
              )}
            >
              <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_220px]">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{task.title}</h3>
                    <StatusBadge status={task.status} />
                    <PriorityBadge priority={task.priority} />
                  </div>
                  {task.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {(task.startTime || task.dueTime) && (
                      <span>
                        {task.startTime ?? "—"} – {task.dueTime ?? "—"}
                      </span>
                    )}
                    {task.assigneeName && <span>👤 {task.assigneeName}</span>}
                    {task.projectName && <span>📁 {task.projectName}</span>}
                  </div>
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{task.progress ?? 0}%</span>
                    </div>
                    <Progress value={task.progress ?? 0} />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      defaultValue={task.progress ?? 0}
                      className="w-full accent-[var(--primary)]"
                      onMouseUp={(e) => {
                        const value = Number((e.target as HTMLInputElement).value);
                        startTransition(async () => {
                          const result = await updateTaskProgressAction(task.id, value);
                          if (result?.error) toast.error(result.error);
                          else router.refresh();
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    value={task.status}
                    onChange={(e) => {
                      startTransition(async () => {
                        const result = await updateTaskStatusAction(
                          task.id,
                          e.target.value as TaskStatus,
                        );
                        if (result?.error) toast.error(result.error);
                        else router.refresh();
                      });
                    }}
                  >
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <label className="text-xs font-medium text-muted-foreground">Assign to</label>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    value={task.assigneeId ?? ""}
                    onChange={(e) => {
                      startTransition(async () => {
                        const result = await assignTaskAction(task.id, e.target.value || null);
                        if (result?.error) toast.error(result.error);
                        else {
                          toast.success("Assigned");
                          router.refresh();
                        }
                      });
                    }}
                  >
                    <option value="">Unassigned</option>
                    {options.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
