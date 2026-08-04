import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/tasks/status-badge";
import { PriorityBadge } from "@/components/tasks/priority-badge";
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
  className?: string;
};

export function TaskCard({ task, href, className }: TaskCardProps) {
  const content = (
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
          <h3 className="font-medium leading-snug">{task.title}</h3>
          <StatusBadge status={task.status} />
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
          {task.projectName && (
            <span className="rounded-md bg-muted px-1.5 py-0.5">{task.projectName}</span>
          )}
          {task.isOverdue && <span className="font-medium text-destructive">Overdue</span>}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
