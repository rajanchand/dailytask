"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Bell } from "lucide-react";
import { toast } from "sonner";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskForm } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createTaskAction } from "@/server/actions/tasks";
import { canDeleteTask, canUpdateTask } from "@/server/task-access";
import { todayISO } from "@/lib/utils";
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
  };
};

export function ProjectDetailClient({ project, tasks, stats, options, access }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
              className="h-4 w-4 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
              {project.description && (
                <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
              )}
            </div>
          </div>
          <div className="max-w-sm space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                {stats.completed}/{stats.total} tasks done
              </span>
              <span>{stats.progress}%</span>
            </div>
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
                  defaultValues={{ date: todayISO(), projectId: project.id }}
                  pending={pending}
                  submitLabel="Add to Project"
                />
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No tasks in this project yet.
          {access.canCreate ? " Add one to get started." : ""}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <div key={task.id} className="relative">
              {(task.dailyNotify || task.recurrence === "daily") && (
                <span
                  className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                  title="Daily morning notify"
                >
                  <Bell className="h-3 w-3" />
                  Daily
                </span>
              )}
              <TaskCard
                task={task}
                options={options}
                lockProjectId={project.id}
                canEdit={canUpdateTask(access.role, access.userId, task)}
                canDelete={canDeleteTask(access.role, access.userId, task)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
