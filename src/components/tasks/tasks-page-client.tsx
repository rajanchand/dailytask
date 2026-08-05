"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskForm } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createTaskAction } from "@/server/actions/tasks";
import { canDeleteTask, canUpdateTask } from "@/server/task-access";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/utils";
import type { Role } from "@/server/db/schema";

type Task = {
  id: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  date: string;
  startTime?: string | null;
  dueTime?: string | null;
  status: string;
  priority: string;
  progress?: number | null;
  isOverdue?: boolean;
  assigneeId?: string | null;
  createdById: string;
  projectId?: string | null;
  categoryId?: string | null;
  recurrence?: string | null;
  dailyNotify?: boolean | null;
  assigneeName?: string | null;
  projectName?: string | null;
};

type Props = {
  tasks: Task[];
  options: {
    users: { id: string; name: string; email: string }[];
    projects: { id: string; name: string }[];
    categories: { id: string; name: string }[];
  };
  filters: { date?: string; status?: string; priority?: string; q?: string };
  access: {
    userId: string;
    role: Role;
    canCreate: boolean;
  };
};

export function TasksPageClient({ tasks, options, filters, access }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createTaskAction(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Task created");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" name="date" type="date" defaultValue={filters.date} className="w-40" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={filters.status ?? ""}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            >
              <option value="">All</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="priority">Priority</Label>
            <select
              id="priority"
              name="priority"
              defaultValue={filters.priority ?? ""}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            >
              <option value="">All</option>
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="q">Search</Label>
            <Input id="q" name="q" placeholder="Search tasks…" defaultValue={filters.q} className="w-48" />
          </div>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>

        {access.canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Task</DialogTitle>
              </DialogHeader>
              <form action={handleCreate}>
                <TaskForm options={options} defaultValues={{ date: filters.date }} pending={pending} submitLabel="Create Task" />
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No tasks match your filters.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              options={options}
              canEdit={canUpdateTask(access.role, access.userId, task)}
              canDelete={canDeleteTask(access.role, access.userId, task)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
