"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateTaskStatusAction } from "@/server/actions/tasks";
import { STATUS_LABELS, cn } from "@/lib/utils";
import type { TaskStatus } from "@/server/db/schema";

type Props = {
  taskId: string;
  status: string;
  disabled?: boolean;
  className?: string;
};

export function TaskStatusSelect({ taskId, status, disabled, className }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={status}
      disabled={disabled || pending}
      aria-label="Change status"
      title="Change status"
      className={cn(
        "h-8 max-w-[9.5rem] rounded-md border border-border bg-card px-2 text-xs font-medium outline-none focus:ring-2 focus:ring-ring disabled:opacity-60",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value as TaskStatus;
        startTransition(async () => {
          const result = await updateTaskStatusAction(taskId, next);
          if (result?.error) toast.error(result.error);
          else {
            toast.success(`Status → ${STATUS_LABELS[next] ?? next}`);
            router.refresh();
          }
        });
      }}
    >
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
