"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/tasks/status-badge";
import { PriorityBadge } from "@/components/tasks/priority-badge";
import { DeleteTaskButton } from "@/components/tasks/delete-task-button";
import { EditTaskButton, type EditableTask } from "@/components/tasks/edit-task-button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Bell, Clock, User } from "lucide-react";

type FormOptions = {
  users: { id: string; name: string; email: string }[];
  projects: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

type TaskCardProps = {
  task: EditableTask & {
    isOverdue?: boolean;
    assigneeName?: string | null;
    projectName?: string | null;
  };
  href?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  options?: FormOptions;
  lockProjectId?: string;
  /** Hide project chip when already viewing inside that project. */
  hideProject?: boolean;
  className?: string;
};

export function TaskCard({
  task,
  href,
  canEdit,
  canDelete,
  options,
  lockProjectId,
  hideProject,
  className,
}: TaskCardProps) {
  const isDaily = Boolean(task.dailyNotify || task.recurrence === "daily");
  const showActions = (canEdit && options) || canDelete;

  return (
    <Card
      className={cn(
        "transition-all hover:-translate-y-0.5 hover:shadow-md",
        (task.priority === "high" || task.priority === "critical") && "priority-high",
        task.isOverdue && "border-destructive/50",
        className,
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            {href ? (
              <Link href={href} className="block font-medium leading-snug hover:underline">
                {task.title}
              </Link>
            ) : (
              <h3 className="font-medium leading-snug">{task.title}</h3>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={task.status} />
              {isDaily && (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200"
                  title="Morning reminder every day"
                >
                  <Bell className="h-3 w-3" />
                  Daily
                </span>
              )}
              {task.isOverdue && (
                <span className="text-[11px] font-medium text-destructive">Overdue</span>
              )}
            </div>
          </div>

          {showActions && (
            <div className="flex shrink-0 items-center rounded-lg border border-border bg-muted/40 p-0.5">
              {canEdit && options && (
                <EditTaskButton
                  task={task}
                  options={options}
                  canDelete={canDelete}
                  lockProjectId={lockProjectId}
                />
              )}
              {canDelete && (
                <DeleteTaskButton taskId={task.id} taskTitle={task.title} />
              )}
            </div>
          )}
        </div>

        {task.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
        )}

        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Progress</span>
            <span>{task.progress ?? 0}%</span>
          </div>
          <Progress value={task.progress ?? 0} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <PriorityBadge priority={task.priority} />
          {(task.startTime || task.dueTime) && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {task.startTime ?? "—"}
              {task.dueTime ? ` – ${task.dueTime}` : ""}
            </span>
          )}
          {task.assigneeName && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {task.assigneeName}
            </span>
          )}
          {!hideProject && task.projectName && (
            <span className="rounded-md bg-muted px-1.5 py-0.5">{task.projectName}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
