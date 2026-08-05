"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TaskForm } from "@/components/tasks/task-form";
import { updateTaskAction, deleteTaskAction } from "@/server/actions/tasks";
import { cn } from "@/lib/utils";

export type EditableTask = {
  id: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  date: string;
  startTime?: string | null;
  dueTime?: string | null;
  priority: string;
  status: string;
  assigneeId?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  recurrence?: string | null;
  dailyNotify?: boolean | null;
  progress?: number | null;
};

type FormOptions = {
  users: { id: string; name: string; email: string }[];
  projects: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

type Props = {
  task: EditableTask;
  options: FormOptions;
  canDelete?: boolean;
  lockProjectId?: string;
  className?: string;
  variant?: "ghost" | "outline" | "secondary";
  size?: "sm" | "icon" | "default";
  label?: string;
};

export function EditTaskButton({
  task,
  options,
  canDelete,
  lockProjectId,
  className,
  variant = "ghost",
  size = "icon",
  label,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave(formData: FormData) {
    if (lockProjectId) formData.set("projectId", lockProjectId);
    startTransition(async () => {
      const result = await updateTaskAction(task.id, formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Task updated");
        setOpen(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Task deleted");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={cn(
            variant === "ghost" && "text-muted-foreground hover:text-foreground",
            className,
          )}
          aria-label={`Edit ${task.title}`}
          title="Edit task"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Pencil className="h-4 w-4" />
          {label ? <span>{label}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-lg"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form action={handleSave}>
          <TaskForm
            options={options}
            lockProjectId={lockProjectId}
            pending={pending}
            submitLabel="Save changes"
            onDelete={canDelete ? handleDelete : undefined}
            defaultValues={{
              title: task.title,
              description: task.description ?? undefined,
              notes: task.notes ?? undefined,
              date: task.date,
              startTime: task.startTime ?? undefined,
              dueTime: task.dueTime ?? undefined,
              priority: task.priority,
              status: task.status,
              assigneeId: task.assigneeId ?? undefined,
              projectId: task.projectId ?? undefined,
              categoryId: task.categoryId ?? undefined,
              recurrence: task.recurrence ?? "none",
              dailyNotify: task.dailyNotify ?? false,
              progress: task.progress ?? 0,
            }}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
