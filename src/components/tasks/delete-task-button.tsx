"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteTaskAction } from "@/server/actions/tasks";
import { cn } from "@/lib/utils";

type Props = {
  taskId: string;
  taskTitle: string;
  className?: string;
  variant?: "ghost" | "outline" | "destructive";
  size?: "sm" | "icon" | "default";
  label?: string;
};

export function DeleteTaskButton({
  taskId,
  taskTitle,
  className,
  variant = "ghost",
  size = "icon",
  label,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${taskTitle}"? This cannot be undone.`)) return;

    startTransition(async () => {
      const result = await deleteTaskAction(taskId);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Task deleted");
        router.refresh();
      }
    });
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      className={cn(
        variant === "ghost" && "text-muted-foreground hover:text-destructive",
        className,
      )}
      onClick={handleDelete}
      aria-label={`Delete ${taskTitle}`}
      title="Delete task"
    >
      <Trash2 className="h-4 w-4" />
      {label ? <span>{pending ? "Deleting…" : label}</span> : null}
    </Button>
  );
}
