"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Bell, Search } from "lucide-react";
import { toast } from "sonner";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskForm } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EditProjectButton } from "@/components/projects/edit-project-button";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { createTaskAction } from "@/server/actions/tasks";
import { canDeleteTask, canUpdateTask } from "@/server/task-access";
import { PRIORITY_LABELS, todayISO } from "@/lib/utils";
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
  assigneeName?: string | null;
  projectName?: string | null;
  recurrence?: string | null;
  dailyNotify?: boolean | null;
  sortOrder?: number;
};

type Props = {
  project: {
    id: string;
    name: string;
    description?: string | null;
    color: string;
  };
  tasks: Task[];
  stats: { total: number; completed: number; progress: number };
  options: {
    users: { id: string; name: string; email: string }[];
    projects: { id: string; name: string }[];
    categories: { id: string; name: string }[];
  };
  access: {
    userId: string;
    role: Role;
    canCreate: boolean;
    canManageProject: boolean;
  };
};

const priorityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export function ProjectDetailClient({ project, tasks, stats, options, access }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const dailyCount = tasks.filter((t) => t.dailyNotify || t.recurrence === "daily").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...tasks]
      .filter((t) => {
        if (priorityFilter && t.priority !== priorityFilter) return false;
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.assigneeName ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const as = (a as { sortOrder?: number }).sortOrder ?? 0;
        const bs = (b as { sortOrder?: number }).sortOrder ?? 0;
        if (as !== bs) return as - bs;
        const ao = priorityOrder[a.priority] ?? 9;
        const bo = priorityOrder[b.priority] ?? 9;
        if (ao !== bo) return ao - bo;
        return a.title.localeCompare(b.title);
      });
  }, [tasks, query, priorityFilter]);

  function handleCreate(formData: FormData) {
    formData.set("projectId", project.id);
    startTransition(async () => {
      const result = await createTaskAction(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Task added to project");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All projects
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="h-4 w-4 shrink-0 rounded-full ring-2 ring-background shadow"
              style={{ backgroundColor: project.color }}
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
              {project.description && (
                <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
              )}
            </div>
            {access.canManageProject && (
              <div className="ml-1 flex items-center gap-0.5">
                <EditProjectButton project={project} variant="outline" size="sm" label="Edit" />
                <DeleteProjectButton
                  projectId={project.id}
                  projectName={project.name}
                  variant="outline"
                  size="sm"
                  label="Delete"
                  redirectToList
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              {stats.completed}/{stats.total} done · {stats.progress}%
            </span>
            {dailyCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200">
                <Bell className="h-3 w-3" />
                {dailyCount} daily notify
              </span>
            )}
          </div>
          <div className="max-w-md">
            <Progress value={stats.progress} />
          </div>
        </div>

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
                <DialogTitle>Add task to {project.name}</DialogTitle>
              </DialogHeader>
              <form action={handleCreate}>
                <TaskForm
                  options={options}
                  lockProjectId={project.id}
                  defaultValues={{
                    date: todayISO(),
                    projectId: project.id,
                    dailyNotify: true,
                    recurrence: "daily",
                  }}
                  pending={pending}
                  submitLabel="Add to Project"
                />
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="pl-9"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            aria-label="Filter by priority"
          >
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No tasks in this project yet.
          {access.canCreate ? " Add one to get started." : ""}
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No tasks match your filters.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              options={options}
              lockProjectId={project.id}
              hideProject
              canEdit={canUpdateTask(access.role, access.userId, task)}
              canDelete={canDeleteTask(access.role, access.userId, task)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
