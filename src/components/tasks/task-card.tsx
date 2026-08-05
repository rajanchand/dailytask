import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/tasks/status-badge";
import { PriorityBadge } from "@/components/tasks/priority-badge";
import { DeleteTaskButton } from "@/components/tasks/delete-task-button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Clock, User } from "lucide-react";

type TaskCardProps = {
  task: {
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
    assigneeName?: string | null;
    projectName?: string | null;
  };
  href?: string;
  canDelete?: boolean;
  className?: string;
};

export function TaskCard({ task, href, canDelete, className }: TaskCardProps) {
  const details = (
    <>
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
        {task.projectName && (
          <span className="rounded-md bg-muted px-1.5 py-0.5">{task.projectName}</span>
        )}
        {task.isOverdue && <span className="font-medium text-destructive">Overdue</span>}
      </div>
    </>
  );

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
        <div className="flex items-start justify-between gap-2">
          {href ? (
            <Link href={href} className="min-w-0 flex-1 font-medium leading-snug hover:underline">
              {task.title}
            </Link>
          ) : (
            <h3 className="min-w-0 flex-1 font-medium leading-snug">{task.title}</h3>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <StatusBadge status={task.status} />
            {canDelete && (
              <DeleteTaskButton taskId={task.id} taskTitle={task.title} />
            )}
          </div>
        </div>
        {href ? (
          <Link href={href} className="block space-y-3">
            {details}
          </Link>
        ) : (
          <div className="space-y-3">{details}</div>
        )}
      </CardContent>
    </Card>
  );
}
